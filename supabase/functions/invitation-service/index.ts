import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * ACCESS SERVICE
 *
 * Every privileged change to who can use this system - invite, role change, suspend,
 * remove - goes through here.
 *
 * The function name stays `invitation-service` deliberately. The previously deployed
 * version of this function contained a privilege-escalation hole (see below); deploying
 * under this name overwrites it, whereas renaming would leave the vulnerable function
 * live until someone remembered to delete it.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS WRONG BEFORE
 * ---------------------------------------------------------------------------
 *
 * `update-role` and `delete-user` verified the caller's *password* and nothing else. A
 * password proves identity, not authority - so any authenticated user, guest included,
 * could call update-role with their own correct password and set their own role to admin.
 * `list-users` checked nothing at all and returned every profile to any caller.
 *
 * Authorization (may this caller do this?) and authentication (is this caller who they
 * say?) are now separate, explicit steps, and both run on every privileged action.
 *
 * ---------------------------------------------------------------------------
 * ELEVATION, INSTEAD OF A PASSWORD PER ACTION
 * ---------------------------------------------------------------------------
 *
 * The old flow re-sent the admin's plaintext password for every single action and
 * verified it with signInWithPassword, which mints a real session each time. Changing
 * five people's roles meant five password transmissions and five orphaned refresh tokens
 * accumulating against the admin's account, polluting the Active Sessions list and
 * burning GoTrue's sign-in rate limit.
 *
 * Now the password is exchanged once for a short-lived elevation token:
 *
 *   - HMAC-SHA256 over {user id, auth session id, expiry, nonce}, signed with a secret
 *     the client never sees, so it cannot be forged or extended.
 *   - Bound to the `session_id` claim of the caller's access token, so a stolen token is
 *     useless from any other device or sign-in.
 *   - Valid for ELEVATION_TTL_MS, held in memory by the client only.
 *   - The throwaway session created while checking the password is signed out
 *     immediately, so no refresh token survives the check.
 */

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});

/** How long one identity check stays good for. Long enough to finish a batch of changes. */
const ELEVATION_TTL_MS = 10 * 60 * 1000;

/** Roles this service will ever assign. `developer` is deliberately absent - see assertCanAssign. */
const ASSIGNABLE_ROLES = ['admin', 'staff', 'guest'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

type Role = AssignableRole | 'developer';

class AccessError extends Error {
	constructor(
		message: string,
		readonly status = 400,
		readonly code = 'access_error'
	) {
		super(message);
	}
}

// ---------------------------------------------------------------------------
// Elevation tokens
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array {
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Falls back to the service-role key when ACCESS_ELEVATION_SECRET is unset so the feature
 * works on a fresh deploy. Set the dedicated secret in production: rotating the signing
 * key should not mean rotating database credentials.
 */
function elevationSecret(): string {
	const dedicated = Deno.env.get('ACCESS_ELEVATION_SECRET');
	if (dedicated) return dedicated;
	const fallback = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!fallback) throw new AccessError('Server is missing its signing secret.', 500);
	return fallback;
}

async function hmacKey(): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(elevationSecret()),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

interface ElevationClaims {
	sub: string;
	sid: string | null;
	exp: number;
	nonce: string;
}

async function issueElevation(userId: string, authSessionId: string | null) {
	const claims: ElevationClaims = {
		sub: userId,
		sid: authSessionId,
		exp: Date.now() + ELEVATION_TTL_MS,
		nonce: crypto.randomUUID()
	};
	const payload = b64url(encoder.encode(JSON.stringify(claims)));
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(payload));
	return {
		token: `v1.${payload}.${b64url(new Uint8Array(signature))}`,
		expiresAt: claims.exp
	};
}

/**
 * Throws unless `token` is a signature-valid, unexpired elevation for exactly this user
 * and this auth session.
 */
async function assertElevated(
	token: string | undefined,
	userId: string,
	authSessionId: string | null
) {
	if (!token) {
		throw new AccessError('This action requires identity confirmation.', 401, 'elevation_required');
	}

	const parts = token.split('.');
	if (parts.length !== 3 || parts[0] !== 'v1') {
		throw new AccessError(
			'Confirmation expired. Please confirm your identity again.',
			401,
			'elevation_invalid'
		);
	}

	const [, payload, signature] = parts;
	const valid = await crypto.subtle.verify(
		'HMAC',
		await hmacKey(),
		b64urlDecode(signature),
		encoder.encode(payload)
	);
	if (!valid) {
		throw new AccessError('Confirmation could not be verified.', 401, 'elevation_invalid');
	}

	let claims: ElevationClaims;
	try {
		claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
	} catch {
		throw new AccessError('Confirmation could not be read.', 401, 'elevation_invalid');
	}

	if (claims.exp <= Date.now()) {
		throw new AccessError(
			'Confirmation expired. Please confirm your identity again.',
			401,
			'elevation_expired'
		);
	}
	if (claims.sub !== userId) {
		throw new AccessError('Confirmation belongs to a different account.', 401, 'elevation_invalid');
	}
	// A token lifted from one device is inert on another: the session_id claim differs.
	if (claims.sid && authSessionId && claims.sid !== authSessionId) {
		throw new AccessError('Confirmation belongs to a different sign-in.', 401, 'elevation_invalid');
	}
}

// ---------------------------------------------------------------------------
// Failed-attempt throttling
// ---------------------------------------------------------------------------

/**
 * Best-effort only. Edge functions are ephemeral and run as several isolates, so this
 * bounds an attacker to N attempts *per isolate* rather than N globally. It exists to blunt
 * scripted password guessing against the elevation endpoint; GoTrue's own rate limiting is
 * the real backstop. Move to a table if you need a hard guarantee.
 */
const failedAttempts = new Map<string, { count: number; firstAt: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

function assertNotLockedOut(userId: string) {
	const record = failedAttempts.get(userId);
	if (!record) return;
	if (Date.now() - record.firstAt > LOCKOUT_WINDOW_MS) {
		failedAttempts.delete(userId);
		return;
	}
	if (record.count >= MAX_FAILED_ATTEMPTS) {
		const minutes = Math.ceil((LOCKOUT_WINDOW_MS - (Date.now() - record.firstAt)) / 60000);
		throw new AccessError(
			`Too many incorrect attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
			429,
			'locked_out'
		);
	}
}

function recordFailure(userId: string) {
	const record = failedAttempts.get(userId);
	if (!record || Date.now() - record.firstAt > LOCKOUT_WINDOW_MS) {
		failedAttempts.set(userId, { count: 1, firstAt: Date.now() });
	} else {
		record.count += 1;
	}
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

interface Caller {
	id: string;
	email: string;
	authSessionId: string | null;
	role: Role;
	status: string;
	fullName: string | null;
}

/** Reads the `session_id` claim without verifying - GoTrue already verified this token. */
function sessionIdFromToken(token: string): string | null {
	try {
		const payload = token.split('.')[1];
		if (!payload) return null;
		const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
		const claims = JSON.parse(
			new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
		);
		return claims.session_id ?? null;
	} catch {
		return null;
	}
}

function assertIsAdmin(caller: Caller) {
	if (caller.role !== 'admin' && caller.role !== 'developer') {
		throw new AccessError('You do not have permission to manage access.', 403, 'forbidden');
	}
	if (caller.status === 'suspended') {
		throw new AccessError('Your account is suspended.', 403, 'forbidden');
	}
}

/**
 * Who may be assigned what.
 *
 * `developer` is never assignable through this service, by anyone: it is the role that can
 * reach developer tooling and bypass event-time validation, so it is granted out-of-band
 * in the database. An admin also may not act on an existing developer - otherwise the
 * highest-privilege account could be demoted or deleted by someone below it.
 */
function assertCanAssign(role: string): asserts role is AssignableRole {
	if (!ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
		throw new AccessError(
			role === 'developer'
				? 'Developer accounts cannot be created or assigned from the Access Directory.'
				: `"${role}" is not a valid role.`,
			400,
			'invalid_role'
		);
	}
}

/**
 * `action` is the imperative ("suspend"), used in both messages - an admin acting on
 * themselves and an admin reaching above their level are different refusals and deserve
 * different wording.
 */
function assertCanActOn(caller: Caller, target: { id: string; role: string }, action: string) {
	if (target.role === 'developer' && caller.role !== 'developer') {
		throw new AccessError(
			`Developer accounts cannot be changed from the Access Directory.`,
			403,
			'forbidden'
		);
	}
	if (target.id === caller.id) {
		throw new AccessError(`You cannot ${action} your own account.`, 400, 'self_target');
	}
}

/**
 * Refuses a change that would leave nobody able to administer the system. Without this an
 * admin can demote or suspend the only other admin and lock the organisation out of its
 * own access controls, recoverable only through the Supabase dashboard.
 */
async function assertNotLastAdmin(
	// deno-lint-ignore no-explicit-any
	db: any,
	targetRole: string
) {
	if (targetRole !== 'admin') return;
	const { count, error } = await db
		.from('profiles')
		.select('id', { count: 'exact', head: true })
		.in('role', ['admin', 'developer'])
		.eq('status', 'active');
	if (error) throw error;
	if ((count ?? 0) <= 1) {
		throw new AccessError(
			'This is the last active administrator. Promote someone else first.',
			400,
			'last_admin'
		);
	}
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	try {
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) throw new AccessError('Authentication header missing.', 401);

		const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
		const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
		const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

		const db = createClient(supabaseUrl, serviceRoleKey);

		const accessToken = authHeader.replace('Bearer ', '');
		const {
			data: { user },
			error: authError
		} = await db.auth.getUser(accessToken);

		if (authError || !user) {
			throw new AccessError(
				'Invalid or expired session. Please sign in again.',
				401,
				'unauthenticated'
			);
		}

		const { data: callerProfile } = await db
			.from('profiles')
			.select('role, status, full_name')
			.eq('id', user.id)
			.single();

		if (!callerProfile) throw new AccessError('Your profile could not be found.', 403, 'forbidden');

		const caller: Caller = {
			id: user.id,
			email: user.email ?? '',
			authSessionId: sessionIdFromToken(accessToken),
			role: callerProfile.role,
			status: callerProfile.status ?? 'active',
			fullName: callerProfile.full_name
		};

		// Where an invitee should land after following the emailed link. Without it they
		// arrive at the site root and are bounced twice before reaching setup. Supabase
		// only honours URLs on the project's Redirect URLs allowlist and falls back to
		// SITE_URL otherwise, so an unconfigured project still works, just with the hops.
		const origin = req.headers.get('Origin');
		const inviteRedirectTo = origin ? `${origin}/welcome` : undefined;

		const body = await req.json().catch(() => ({}));
		const { action, elevation } = body as { action?: string; elevation?: string };

		// -------------------------------------------------------------------
		// verify-identity - the only action that accepts a password
		// -------------------------------------------------------------------
		if (action === 'verify-identity') {
			assertIsAdmin(caller);
			assertNotLockedOut(caller.id);

			const { password, captchaToken } = body as { password?: string; captchaToken?: string };
			if (!password) throw new AccessError('Enter your password to continue.', 400);

			// A separate anon client: signing in on `db` would clobber the service-role
			// credentials for the rest of this request.
			const authClient = createClient(supabaseUrl, anonKey);
			const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
				email: caller.email,
				password,
				...(captchaToken ? { options: { captchaToken } } : {})
			});

			if (signInError || !signIn.session) {
				recordFailure(caller.id);
				const remaining = MAX_FAILED_ATTEMPTS - (failedAttempts.get(caller.id)?.count ?? 0);
				throw new AccessError(
					remaining > 0 && remaining <= 2
						? `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
						: 'Incorrect password.',
					401,
					'bad_password'
				);
			}

			// The whole point of the check was the yes/no answer. Leaving the session alive
			// would hand the admin a new refresh token on every elevation - exactly the
			// accumulation the old per-action password flow caused.
			await authClient.auth.signOut({ scope: 'local' }).catch(() => {});

			failedAttempts.delete(caller.id);
			const issued = await issueElevation(caller.id, caller.authSessionId);
			return json({ success: true, ...issued, ttlMs: ELEVATION_TTL_MS });
		}

		// -------------------------------------------------------------------
		// list-directory - read-only, admin-gated
		// -------------------------------------------------------------------
		if (action === 'list-directory' || action === 'list-users') {
			assertIsAdmin(caller);

			const [
				{ data: accounts, error: accountsError },
				{ data: invitations, error: invitesError },
				{ data: sessions }
			] = await Promise.all([
				db.from('profiles').select('*').order('created_at', { ascending: false }),
				db
					.from('invitations')
					.select('*')
					.eq('status', 'pending')
					.gt('expires_at', new Date().toISOString())
					.order('created_at', { ascending: false }),
				// "Last active" is derived from session activity rather than kept as a column
				// on profiles: user_sessions is already touched every five minutes, and
				// mirroring that into profiles would double the write volume to store a value
				// only this screen reads.
				db
					.from('user_sessions')
					.select('user_id, last_active')
					.order('last_active', { ascending: false })
			]);

			if (accountsError) throw accountsError;
			if (invitesError) throw invitesError;

			const lastActive = new Map<string, string>();
			for (const row of sessions ?? []) {
				// Rows arrive newest-first, so the first sighting of a user is their latest.
				if (!lastActive.has(row.user_id)) lastActive.set(row.user_id, row.last_active);
			}

			const enriched = (accounts ?? []).map((account: { id: string }) => ({
				...account,
				last_active_at: lastActive.get(account.id) ?? null
			}));

			return json({ accounts: enriched, invitations: invitations ?? [], users: enriched });
		}

		// Everything past this point mutates access and needs both admin rights and a
		// live elevation.
		assertIsAdmin(caller);
		await assertElevated(elevation, caller.id, caller.authSessionId);

		// -------------------------------------------------------------------
		// send-invite
		// -------------------------------------------------------------------
		if (action === 'send-invite') {
			const { inviteEmail, inviteRole } = body as { inviteEmail?: string; inviteRole?: string };
			if (!inviteEmail) throw new AccessError('Enter an email address.', 400);
			if (!inviteRole) throw new AccessError('Choose a role.', 400);
			assertCanAssign(inviteRole);

			const email = inviteEmail.trim().toLowerCase();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
				throw new AccessError('That does not look like a valid email address.', 400);
			}

			const { data: existing } = await db
				.from('profiles')
				.select('id, email, role')
				.ilike('email', email)
				.maybeSingle();
			if (existing) {
				throw new AccessError(
					'That email already has an account in this system.',
					409,
					'already_exists'
				);
			}

			const { data: pending } = await db
				.from('invitations')
				.select('id')
				.ilike('email', email)
				.eq('status', 'pending')
				.gt('expires_at', new Date().toISOString())
				.maybeSingle();
			if (pending) {
				throw new AccessError(
					'An invitation is already pending for that address. Resend or revoke it instead.',
					409,
					'already_invited'
				);
			}

			// The invitation row is written first: handle_new_user() reads it to decide the
			// role the moment the account is created, and the account can be created the
			// instant the email goes out.
			const { data: invitation, error: insertError } = await db
				.from('invitations')
				.insert({
					email,
					role: inviteRole,
					invited_by: caller.id,
					invited_by_email: caller.email
				})
				.select()
				.single();
			if (insertError) throw insertError;

			const { error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
				// No role in `data`: user metadata is writable by its owner, and the role is
				// read from the invitations row above instead.
				data: { invited_by: caller.id, invitation_id: invitation.id },
				...(inviteRedirectTo ? { redirectTo: inviteRedirectTo } : {})
			});

			if (inviteError) {
				// Don't leave a pending row promising a role for a mail that never sent.
				await db.from('invitations').delete().eq('id', invitation.id);
				if (inviteError.message?.includes('already registered')) {
					throw new AccessError(
						'That email is already registered in this system.',
						409,
						'already_exists'
					);
				}
				throw inviteError;
			}

			return json({ success: true, invitation });
		}

		// -------------------------------------------------------------------
		// resend-invite
		// -------------------------------------------------------------------
		if (action === 'resend-invite') {
			const { invitationId } = body as { invitationId?: string };
			if (!invitationId) throw new AccessError('Invitation not specified.', 400);

			const { data: invitation } = await db
				.from('invitations')
				.select('*')
				.eq('id', invitationId)
				.single();
			if (!invitation) throw new AccessError('That invitation no longer exists.', 404);
			if (invitation.status !== 'pending') {
				throw new AccessError(`That invitation has already been ${invitation.status}.`, 409);
			}

			const { error: inviteError } = await db.auth.admin.inviteUserByEmail(invitation.email, {
				data: { invited_by: caller.id, invitation_id: invitation.id },
				...(inviteRedirectTo ? { redirectTo: inviteRedirectTo } : {})
			});
			if (inviteError) throw inviteError;

			const { error: updateError } = await db
				.from('invitations')
				.update({
					resend_count: (invitation.resend_count ?? 0) + 1,
					last_sent_at: new Date().toISOString(),
					// A resend restarts the clock; otherwise the new mail could arrive already dead.
					expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
				})
				.eq('id', invitation.id);
			if (updateError) throw updateError;

			return json({ success: true });
		}

		// -------------------------------------------------------------------
		// revoke-invite
		// -------------------------------------------------------------------
		if (action === 'revoke-invite') {
			const { invitationId } = body as { invitationId?: string };
			if (!invitationId) throw new AccessError('Invitation not specified.', 400);

			const { data: invitation } = await db
				.from('invitations')
				.select('*')
				.eq('id', invitationId)
				.single();
			if (!invitation) throw new AccessError('That invitation no longer exists.', 404);
			if (invitation.status !== 'pending') {
				throw new AccessError(`That invitation has already been ${invitation.status}.`, 409);
			}

			const { error: revokeError } = await db
				.from('invitations')
				.update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: caller.id })
				.eq('id', invitation.id);
			if (revokeError) throw revokeError;

			// Marking the row revoked is bookkeeping; the live credential is the GoTrue user
			// that inviteUserByEmail created when the mail was sent. Two cases:
			//
			//  - never signed in: delete the account outright, which is what makes the
			//    emailed link dead rather than merely untracked.
			//  - already signed in: deleting would discard whatever they have done since,
			//    so suspend instead. Either way, revoke means they do not get in.
			const { data: list } = await db.auth.admin.listUsers();
			const invited = list?.users?.find(
				(u: { id: string; email?: string; last_sign_in_at?: string | null }) =>
					u.email?.toLowerCase() === invitation.email.toLowerCase()
			);

			let outcome: 'deleted' | 'suspended' | 'none' = 'none';
			if (invited) {
				if (invited.last_sign_in_at) {
					await db
						.from('profiles')
						.update({
							status: 'suspended',
							suspended_at: new Date().toISOString(),
							suspended_reason: 'Invitation revoked after first sign-in',
							updated_at: new Date().toISOString()
						})
						.eq('id', invited.id);
					await db.auth.admin.signOut(invited.id, 'global').catch(() => {});
					await db.from('user_sessions').update({ is_active: false }).eq('user_id', invited.id);
					outcome = 'suspended';
				} else {
					const { error: deleteError } = await db.auth.admin.deleteUser(invited.id);
					if (!deleteError) outcome = 'deleted';
				}
			}

			return json({ success: true, outcome });
		}

		// -------------------------------------------------------------------
		// update-role
		// -------------------------------------------------------------------
		if (action === 'update-role') {
			const { userId, newRole } = body as { userId?: string; newRole?: string };
			if (!userId || !newRole) throw new AccessError('User and role are required.', 400);
			assertCanAssign(newRole);

			const { data: target } = await db
				.from('profiles')
				.select('id, email, role, full_name')
				.eq('id', userId)
				.single();
			if (!target) throw new AccessError('That account no longer exists.', 404);

			assertCanActOn(caller, target, 'change the role of');
			if (target.role === newRole) return json({ success: true, unchanged: true });
			await assertNotLastAdmin(db, target.role);

			const { error: updateError } = await db
				.from('profiles')
				.update({ role: newRole, updated_at: new Date().toISOString() })
				.eq('id', userId);
			if (updateError) throw updateError;

			// Correcting the role of someone who has not finished setup must correct the
			// invitation too, or the directory keeps showing the role they were invited at
			// and their welcome screen describes the wrong job.
			await db
				.from('invitations')
				.update({ role: newRole })
				.ilike('email', target.email)
				.eq('status', 'pending');

			return json({ success: true, previousRole: target.role });
		}

		// -------------------------------------------------------------------
		// set-status - suspend / reactivate
		// -------------------------------------------------------------------
		if (action === 'set-status') {
			const { userId, status, reason } = body as {
				userId?: string;
				status?: string;
				reason?: string;
			};
			if (!userId || !status) throw new AccessError('User and status are required.', 400);
			if (status !== 'active' && status !== 'suspended') {
				throw new AccessError('Status must be active or suspended.', 400);
			}

			const { data: target } = await db
				.from('profiles')
				.select('id, email, role, status, full_name')
				.eq('id', userId)
				.single();
			if (!target) throw new AccessError('That account no longer exists.', 404);

			assertCanActOn(caller, target, 'suspend');
			if (status === 'suspended') await assertNotLastAdmin(db, target.role);

			const { error: updateError } = await db
				.from('profiles')
				.update({
					status,
					suspended_at: status === 'suspended' ? new Date().toISOString() : null,
					suspended_reason: status === 'suspended' ? (reason ?? null) : null,
					updated_at: new Date().toISOString()
				})
				.eq('id', userId);
			if (updateError) throw updateError;

			if (status === 'suspended') {
				// Suspension has to end the sessions they already hold, or it does nothing
				// until their current token expires.
				await db.auth.admin.signOut(userId, 'global').catch(() => {});
				// PostgREST builders report failure in the result rather than throwing, and a
				// stale session row is cosmetic next to the token revocation above.
				await db.from('user_sessions').update({ is_active: false }).eq('user_id', userId);
			}

			return json({ success: true, previousStatus: target.status });
		}

		// -------------------------------------------------------------------
		// delete-user
		// -------------------------------------------------------------------
		if (action === 'delete-user') {
			const { userId } = body as { userId?: string };
			if (!userId) throw new AccessError('User is required.', 400);

			const { data: target } = await db
				.from('profiles')
				.select('id, email, role, full_name')
				.eq('id', userId)
				.single();
			if (!target) throw new AccessError('That account no longer exists.', 404);

			assertCanActOn(caller, target, 'remove');
			await assertNotLastAdmin(db, target.role);

			const { error: deleteError } = await db.auth.admin.deleteUser(userId);
			if (deleteError) throw deleteError;

			return json({ success: true, removed: { email: target.email, role: target.role } });
		}

		throw new AccessError(`Unknown action "${action}".`, 400, 'unknown_action');
	} catch (error) {
		if (error instanceof AccessError) {
			return json({ error: error.message, code: error.code }, error.status);
		}
		const message = error instanceof Error ? error.message : 'An unknown error occurred';
		console.error('Access Service Error:', message);
		return json({ error: message, code: 'unexpected' }, 400);
	}
});

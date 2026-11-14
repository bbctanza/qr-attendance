import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY } from '$env/static/public';
import { supabase } from '$lib/supabase';

/**
 * Kiosk authentication.
 *
 * `scan_member_transaction` requires a caller with a resolved role (PLAN.md section 3), so an
 * unauthenticated kiosk gets an RLS failure on every scan. The device therefore has to be
 * signed in before it can take a single check-in.
 *
 * The credentials are NOT compiled into the app. Baking the kiosk account's password into the
 * bundle would put it in plain text on every installed device and in the repo's build output;
 * instead the device is signed in once at setup and `persistSession` keeps it signed in across
 * restarts and power cuts. That is the same trade PLAN.md already accepted for session storage.
 */

export interface KioskIdentity {
	email: string;
	userId: string;
	/** From profiles.role; null means the account can't scan (missing role or suspended). */
	role: string | null;
}

/** The current session's identity, or null when the device needs signing in. */
export async function currentIdentity(): Promise<KioskIdentity | null> {
	const { data, error } = await supabase.auth.getSession();
	if (error) {
		console.error('[auth] getSession failed', error);
		return null;
	}
	const user = data.session?.user;
	if (!user) return null;

	return { email: user.email ?? '(no email)', userId: user.id, role: await resolveRole() };
}

/**
 * Read the signed-in account's role from `profiles`, the same way the web app does
 * (see src/routes/(protected)/settings/app/+page.svelte). The RLS policies use a SQL-side
 * get_user_role(), but that is not exposed as a callable RPC - `profiles.role` is what the
 * frontend is allowed to read.
 *
 * A suspended account is treated as role-less: it can still be holding a valid access token,
 * and the web app's protected layout refuses it for exactly this reason.
 *
 * Returns null rather than throwing - a kiosk that is signed in but cannot scan should say so
 * on screen, not crash on boot.
 */
export async function resolveRole(): Promise<string | null> {
	const { data: auth } = await supabase.auth.getUser();
	const userId = auth.user?.id;
	if (!userId) return null;

	const { data, error } = await supabase
		.from('profiles')
		.select('role, status')
		.eq('id', userId)
		.single();

	if (error) {
		console.error('[auth] could not read profile role', error);
		return null;
	}
	if (data?.status === 'suspended') {
		console.warn('[auth] account is suspended');
		return null;
	}
	return (data?.role as string | null) ?? null;
}

export interface SignInResult {
	ok: boolean;
	/** Operator-facing reason, already worded for the kiosk screen. */
	message?: string;
	identity?: KioskIdentity;
}

/**
 * Sign the device in. Used both for first-boot setup and for the escape hatch in Settings
 * ("Sign in as a different account"), which is why it reports the resolved role back.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
	const { data, error } = await supabase.auth.signInWithPassword({
		email: email.trim(),
		password
	});

	if (error) {
		return { ok: false, message: error.message || 'Sign-in failed.' };
	}
	if (!data.user) {
		return { ok: false, message: 'Sign-in returned no account.' };
	}

	const role = await resolveRole();
	if (!role) {
		// Signed in but unable to scan - better to refuse here than to let every scan fail.
		await supabase.auth.signOut();
		return {
			ok: false,
			message: 'That account cannot record scans - no role assigned, or it is suspended.'
		};
	}

	return {
		ok: true,
		identity: { email: data.user.email ?? email, userId: data.user.id, role }
	};
}

export async function signOut() {
	const { error } = await supabase.auth.signOut();
	if (error) console.error('[auth] signOut failed', error);
}

/**
 * The escape hatch: swap the device onto an admin's or staff member's own account for this
 * run (PLAN.md section 3). The kiosk *view* never changes - only who the scans are recorded
 * as. Covers the kiosk account being locked out, disabled, or needing higher privileges once.
 *
 * The care here is all in the failure path. `signInWithPassword` replaces the stored session
 * the moment it succeeds, so if the new account then turns out to have no role, a naive
 * implementation leaves a door device signed out mid-event with a queue of people waiting.
 * The previous session is captured first and restored if the new one can't actually scan.
 *
 * A wrong password is safe without any of that - a failed sign-in leaves the existing session
 * untouched - but it costs nothing to hold the tokens for both cases.
 */
export async function switchAccount(email: string, password: string): Promise<SignInResult> {
	const { data: before } = await supabase.auth.getSession();

	const { data, error } = await supabase.auth.signInWithPassword({
		email: email.trim(),
		password
	});

	if (error || !data.user) {
		return { ok: false, message: error?.message || 'Sign-in failed.' };
	}

	const role = await resolveRole();
	if (!role) {
		// Put the kiosk back the way it was rather than leaving it stranded.
		if (before.session) {
			await supabase.auth.setSession({
				access_token: before.session.access_token,
				refresh_token: before.session.refresh_token
			});
		} else {
			await supabase.auth.signOut();
		}
		return {
			ok: false,
			message: 'That account cannot record scans - no role assigned, or it is suspended.'
		};
	}

	return {
		ok: true,
		identity: { email: data.user.email ?? email, userId: data.user.id, role }
	};
}

/**
 * Verify a password for the elevation gate, without disturbing the live kiosk session.
 *
 * Two approaches were rejected first:
 *
 * 1. The web app's `verify-identity` edge function, which is the project's canonical
 *    "confirm it's you". It calls `assertIsAdmin(caller)`, and the kiosk account is `staff`
 *    (PLAN.md section 3) - so the kiosk would get a 403 every time.
 * 2. `signInWithPassword` on the shared client, then restoring the old session. That mutates
 *    the real session: a failure between the two steps leaves the device signed in as
 *    somebody else, or signed out at a door mid-event.
 *
 * So verification happens on a throwaway client with `persistSession: false`. It touches
 * neither the kiosk's stored session nor its localStorage, and is signed out immediately -
 * the same shape as the edge function's own anon-client check.
 *
 * Known cost, inherited from that edge function: a successful check mints a refresh token
 * that `scope: 'local'` does not revoke server-side. Revoking globally would kill the kiosk's
 * own session, which is worse. Elevation is rare and operator-driven, so this is accepted.
 */
export async function verifyPassword(password: string): Promise<boolean> {
	const identity = await currentIdentity();
	if (!identity) return false;

	const probe = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});

	try {
		const { error } = await probe.auth.signInWithPassword({
			email: identity.email,
			password
		});
		await probe.auth.signOut({ scope: 'local' }).catch(() => {});
		return !error;
	} catch (e) {
		console.error('[auth] password verification failed', e);
		return false;
	}
}

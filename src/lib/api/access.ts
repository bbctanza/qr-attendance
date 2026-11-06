import { supabase } from '$lib/supabase';
import { elevation } from '$lib/stores/elevation';

/**
 * Client for the access service - invitations, roles, suspension and removal.
 *
 * Every mutating call carries the current elevation token. When the server rejects one as
 * missing or expired it answers with an `elevation_*` code, which surfaces here as
 * {@link ElevationRequiredError} so callers can prompt once and retry, rather than having
 * to pre-check an expiry they might race.
 */

const FUNCTION_NAME = 'invitation-service';

export type AccessRole = 'admin' | 'staff' | 'guest' | 'developer';
export type AccountStatus = 'active' | 'suspended';

export interface DirectoryAccount {
	id: string;
	email: string;
	full_name: string | null;
	avatar_url: string | null;
	role: AccessRole;
	status: AccountStatus;
	onboarding_completed: boolean | null;
	invited_by: string | null;
	last_active_at: string | null;
	suspended_at: string | null;
	suspended_reason: string | null;
	created_at: string;
	updated_at: string | null;
}

export interface PendingInvitation {
	id: string;
	email: string;
	role: AccessRole;
	status: 'pending';
	invited_by: string | null;
	invited_by_email: string | null;
	expires_at: string;
	resend_count: number;
	last_sent_at: string;
	created_at: string;
}

export interface Directory {
	accounts: DirectoryAccount[];
	invitations: PendingInvitation[];
}

/** Thrown when the server wants a fresh identity confirmation before it will act. */
export class ElevationRequiredError extends Error {
	constructor(message = 'Confirm your identity to continue.') {
		super(message);
		this.name = 'ElevationRequiredError';
	}
}

export class AccessApiError extends Error {
	constructor(
		message: string,
		readonly code: string
	) {
		super(message);
		this.name = 'AccessApiError';
	}
}

interface CallOptions {
	/** Attach the held elevation token. Omit for read-only actions. */
	elevated?: boolean;
}

async function call<T>(
	action: string,
	payload: Record<string, unknown> = {},
	options: CallOptions = {}
): Promise<T> {
	const body: Record<string, unknown> = { action, ...payload };

	if (options.elevated) {
		const token = elevation.current();
		// Short-circuit rather than spend a round-trip to be told what we already know.
		if (!token) throw new ElevationRequiredError();
		body.elevation = token;
	}

	const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

	// supabase-js surfaces a non-2xx as a FunctionsHttpError whose body holds our real
	// message and code; without reading it every failure degrades to "Edge Function
	// returned a non-2xx status code", which tells the admin nothing.
	if (error) {
		const parsed = await readFunctionError(error);
		throw toAccessError(parsed.message, parsed.code);
	}
	if (data?.error) {
		throw toAccessError(data.error, data.code ?? 'access_error');
	}

	return data as T;
}

async function readFunctionError(error: unknown): Promise<{ message: string; code: string }> {
	const context = (error as { context?: Response }).context;
	if (context && typeof context.json === 'function') {
		try {
			const payload = await context.json();
			if (payload?.error) {
				return { message: payload.error, code: payload.code ?? 'access_error' };
			}
		} catch {
			// Body wasn't JSON (a gateway error page, say) - fall through to the generic message.
		}
	}
	return {
		message: error instanceof Error ? error.message : 'The access service could not be reached.',
		code: 'network'
	};
}

function toAccessError(message: string, code: string) {
	if (code.startsWith('elevation_')) {
		elevation.clear();
		return new ElevationRequiredError(message);
	}
	return new AccessApiError(message, code);
}

export const accessApi = {
	/**
	 * Exchange the password for an elevation token and hold it.
	 * `captchaToken` is passed through when the project enforces CAPTCHA on password grants.
	 */
	async verifyIdentity(password: string, captchaToken?: string) {
		const data = await call<{ token: string; expiresAt: number; ttlMs: number }>(
			'verify-identity',
			{ password, captchaToken }
		);
		elevation.grant(data.token, data.expiresAt);
		return data;
	},

	/** Accounts and live invitations in one call. Read-only; admin-gated server side. */
	async listDirectory(): Promise<Directory> {
		const data = await call<Directory>('list-directory');
		return { accounts: data.accounts ?? [], invitations: data.invitations ?? [] };
	},

	sendInvite(inviteEmail: string, inviteRole: AccessRole) {
		return call<{ success: true; invitation: PendingInvitation }>(
			'send-invite',
			{ inviteEmail, inviteRole },
			{ elevated: true }
		);
	},

	resendInvite(invitationId: string) {
		return call<{ success: true }>('resend-invite', { invitationId }, { elevated: true });
	},

	revokeInvite(invitationId: string) {
		return call<{ success: true }>('revoke-invite', { invitationId }, { elevated: true });
	},

	updateRole(userId: string, newRole: AccessRole) {
		return call<{ success: true; previousRole?: AccessRole; unchanged?: boolean }>(
			'update-role',
			{ userId, newRole },
			{ elevated: true }
		);
	},

	setStatus(userId: string, status: AccountStatus, reason?: string) {
		return call<{ success: true; previousStatus?: AccountStatus }>(
			'set-status',
			{ userId, status, reason },
			{ elevated: true }
		);
	},

	deleteUser(userId: string) {
		return call<{ success: true; removed: { email: string; role: AccessRole } }>(
			'delete-user',
			{ userId },
			{ elevated: true }
		);
	}
};

// ---------------------------------------------------------------------------
// Role presentation
// ---------------------------------------------------------------------------

export interface RoleDefinition {
	value: AccessRole;
	label: string;
	/** One line an admin can act on, not a restatement of the role name. */
	summary: string;
	capabilities: string[];
}

/**
 * What each role actually means, in one place, so the invite form, the directory and the
 * new member's welcome screen cannot drift apart in describing the same grant.
 */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
	{
		value: 'admin',
		label: 'Administrator',
		summary: 'Full control, including who else gets access.',
		capabilities: [
			'Everything a staff member can do',
			'Invite, suspend and remove accounts',
			'Change system settings and view audit logs'
		]
	},
	{
		value: 'staff',
		label: 'Staff',
		summary: 'Day-to-day attendance work.',
		capabilities: [
			'Scan attendance and run events',
			'Add and edit members and groups',
			'View attendance history and reports'
		]
	},
	{
		value: 'guest',
		label: 'Guest',
		summary: 'Read-only. Can see, cannot change.',
		capabilities: ['View attendance and members', 'No scanning, editing or exporting']
	}
];

/** Assignable through the UI. `developer` is granted in the database only. */
export const ASSIGNABLE_ROLES = ROLE_DEFINITIONS.map((r) => r.value);

export function roleLabel(role: string | null | undefined): string {
	if (!role) return 'Unknown';
	if (role === 'developer') return 'Developer';
	return ROLE_DEFINITIONS.find((r) => r.value === role)?.label ?? role;
}

export function roleDefinition(role: string | null | undefined): RoleDefinition | undefined {
	return ROLE_DEFINITIONS.find((r) => r.value === role);
}

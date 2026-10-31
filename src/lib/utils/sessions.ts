import { supabase } from '$lib/supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Active-session tracking.
 *
 * Every row is keyed on `auth_session_id` — the `session_id` claim carried in the Supabase
 * access-token JWT. That is what makes a row correspond to a real device: it is stable across
 * reloads and token refreshes, unique per sign-in, and comparable against the current token,
 * so "which row is this device" is an exact answer rather than a guess at the most recent one.
 */

export interface UserSession {
	id: string;
	auth_session_id: string | null;
	device_name: string;
	browser: string;
	ip_address: string;
	location: string;
	last_active: string;
	created_at: string;
	is_current?: boolean;
}

/** Rows untouched for longer than this are treated as expired and hidden from the list. */
const STALE_SESSION_DAYS = 30;

/** Outcome of registering this device. `revoked` means the row was deliberately killed. */
export type RegisterResult =
	{ status: 'registered'; session: UserSession } | { status: 'revoked' } | { status: 'skipped' };

/** State of this device's own row, as the watchdog and activity ping see it. */
export type OwnSessionState = 'active' | 'revoked' | 'missing' | 'unknown';

// ---------------------------------------------------------------------------
// Identity: reading session_id out of the access token
// ---------------------------------------------------------------------------

function base64UrlDecode(input: string): string {
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

/**
 * Pull the `session_id` claim from an access token.
 *
 * No signature verification happens here, and none is needed: this is our own token, already
 * validated by Supabase, and the claim is only used to match a row we also own. It is never
 * treated as an authorization decision.
 */
export function authSessionIdFrom(session: Session | null | undefined): string | null {
	if (!session?.access_token || typeof atob === 'undefined') return null;

	try {
		const payload = session.access_token.split('.')[1];
		if (!payload) return null;

		const claims = JSON.parse(base64UrlDecode(payload)) as { session_id?: unknown };
		return typeof claims.session_id === 'string' ? claims.session_id : null;
	} catch (e) {
		console.error('Could not read session_id from access token:', e);
		return null;
	}
}

/** session_id for the signed-in user on this device, or null if not signed in. */
export async function getCurrentAuthSessionId(): Promise<string | null> {
	const {
		data: { session }
	} = await supabase.auth.getSession();
	return authSessionIdFrom(session);
}

// ---------------------------------------------------------------------------
// Device + request context
// ---------------------------------------------------------------------------

function getDeviceInfo() {
	const ua = navigator.userAgent;

	// Device detection
	let device = 'Unknown Device';
	if (/iPhone/.test(ua)) device = 'iPhone';
	else if (/iPad/.test(ua)) device = 'iPad';
	else if (/Android/.test(ua)) device = 'Android Device';
	else if (/Mac/.test(ua)) device = 'Mac';
	else if (/Windows/.test(ua)) device = 'Windows PC';
	else if (/Linux/.test(ua)) device = 'Linux';

	// Add more specific model info if available
	const iPhoneMatch = ua.match(/iPhone OS (\d+)_(\d+)/);
	if (iPhoneMatch) device = `iPhone (iOS ${iPhoneMatch[1]})`;

	// Browser detection
	let browser = 'Unknown Browser';
	if (/Chrome\//.test(ua) && !/Edge|Edg\//.test(ua)) browser = 'Chrome';
	else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
	else if (/Firefox\//.test(ua)) browser = 'Firefox';
	else if (/Edge|Edg\//.test(ua)) browser = 'Edge';
	else if (/Opera|OPR\//.test(ua)) browser = 'Opera';

	const versionMatch = ua.match(/(?:Chrome|Safari|Firefox|Version|Edge)\/(\d+)/);
	if (versionMatch) {
		browser += ` ${versionMatch[1]}`;
	}

	return { device, browser };
}

/**
 * IP and coarse location, read from our own request headers server-side.
 *
 * Replaces a direct client call to ipapi.co, which handed the user's IP to a third party and
 * failed under ad blockers or its daily rate limit — the usual source of "Unknown Location".
 */
async function getSessionContext(): Promise<{ ip_address: string; location: string }> {
	try {
		const response = await fetch('/api/session-context');
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const data = (await response.json()) as { ip?: string; location?: string };
		return {
			ip_address: data.ip || 'Unknown',
			location: data.location || 'Unknown Location'
		};
	} catch (e) {
		console.warn('Could not resolve session context:', e);
		return { ip_address: 'Unknown', location: 'Unknown Location' };
	}
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Record this device as an active session, or report that it has been revoked.
 *
 * Idempotent, so it is safe to call on every mount and auth event. Deliberately an
 * insert-or-update rather than an upsert: a plain upsert would flip `is_active` back to true
 * and let a device that was just signed out elsewhere resurrect its own session on the next
 * navigation. When the row exists but is inactive this returns `revoked` and writes nothing,
 * leaving the caller to sign out.
 */
export async function registerSession(): Promise<RegisterResult> {
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.user) return { status: 'skipped' };

		const authSessionId = authSessionIdFrom(session);
		if (!authSessionId) {
			// Older GoTrue versions omit the claim; without it a row cannot identify a device.
			console.warn('Access token carries no session_id claim; skipping session tracking');
			return { status: 'skipped' };
		}

		const { data: existing, error: lookupError } = await supabase
			.from('user_sessions')
			.select('id, is_active')
			.eq('auth_session_id', authSessionId)
			.maybeSingle();

		if (lookupError) {
			console.error('Failed to look up existing session:', lookupError);
			return { status: 'skipped' };
		}

		if (existing && !existing.is_active) {
			return { status: 'revoked' };
		}

		const { device, browser } = getDeviceInfo();
		const { ip_address, location } = await getSessionContext();
		const now = new Date().toISOString();

		// Note the absence of is_active on the update path — see the doc comment above.
		const details = {
			device_name: device,
			browser,
			ip_address,
			location,
			last_active: now
		};

		if (existing) {
			const { data, error } = await supabase
				.from('user_sessions')
				.update(details)
				.eq('id', existing.id)
				.select()
				.single();

			if (error) {
				console.error('Failed to refresh session:', error);
				return { status: 'skipped' };
			}
			return { status: 'registered', session: data as UserSession };
		}

		const { data, error } = await supabase
			.from('user_sessions')
			.insert([
				{
					user_id: session.user.id,
					auth_session_id: authSessionId,
					is_active: true,
					...details
				}
			])
			.select()
			.single();

		if (error) {
			// 23505: another tab inserted the same auth_session_id first. The unique index did
			// its job; adopt the winning row instead of creating a duplicate.
			if (error.code === '23505') {
				const { data: raced } = await supabase
					.from('user_sessions')
					.select('*')
					.eq('auth_session_id', authSessionId)
					.maybeSingle();

				if (raced) {
					const row = raced as UserSession & { is_active: boolean };
					return row.is_active ? { status: 'registered', session: row } : { status: 'revoked' };
				}
			}

			console.error('Failed to create session:', error);
			return { status: 'skipped' };
		}

		return { status: 'registered', session: data as UserSession };
	} catch (e) {
		console.error('Error registering session:', e);
		return { status: 'skipped' };
	}
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Active sessions for the signed-in user, current device first.
 *
 * `is_current` is decided by matching `auth_session_id` against this device's own token, so
 * the badge lands on the right row no matter which device was most recently used.
 */
export async function getUserSessions(): Promise<UserSession[]> {
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.user) return [];

		const currentAuthSessionId = authSessionIdFrom(session);
		const cutoff = new Date(Date.now() - STALE_SESSION_DAYS * 86400000).toISOString();

		const { data, error } = await supabase
			.from('user_sessions')
			.select('*')
			.eq('user_id', session.user.id)
			.eq('is_active', true)
			.gt('last_active', cutoff)
			.order('last_active', { ascending: false });

		if (error) {
			console.error('Failed to fetch sessions:', error);
			return [];
		}

		const sessions = ((data || []) as UserSession[]).map((s) => ({
			...s,
			is_current: !!currentAuthSessionId && s.auth_session_id === currentAuthSessionId
		}));

		// Current device first; everything else stays in last-active order.
		return sessions.sort((a, b) => Number(b.is_current) - Number(a.is_current));
	} catch (e) {
		console.error('Error fetching sessions:', e);
		return [];
	}
}

/** Whether this device's own row is still active. Drives the watchdog's fallback check. */
export async function checkOwnSession(): Promise<OwnSessionState> {
	try {
		const authSessionId = await getCurrentAuthSessionId();
		if (!authSessionId) return 'unknown';

		const { data, error } = await supabase
			.from('user_sessions')
			.select('is_active')
			.eq('auth_session_id', authSessionId)
			.maybeSingle();

		if (error) {
			// Treat a failed check as inconclusive: a flaky network must never sign anyone out.
			console.error('Failed to check own session:', error);
			return 'unknown';
		}

		if (!data) return 'missing';
		return data.is_active ? 'active' : 'revoked';
	} catch (e) {
		console.error('Error checking own session:', e);
		return 'unknown';
	}
}

/** Refresh this device's last-active timestamp, reporting back if it has been revoked. */
export async function touchSession(): Promise<OwnSessionState> {
	try {
		const authSessionId = await getCurrentAuthSessionId();
		if (!authSessionId) return 'unknown';

		const { data, error } = await supabase
			.from('user_sessions')
			.update({ last_active: new Date().toISOString() })
			.eq('auth_session_id', authSessionId)
			.eq('is_active', true)
			.select('id');

		if (error) {
			console.error('Failed to update session activity:', error);
			return 'unknown';
		}

		// Nothing updated: either revoked or never registered. checkOwnSession says which.
		if (!data || data.length === 0) return await checkOwnSession();

		return 'active';
	} catch (e) {
		console.error('Error updating session activity:', e);
		return 'unknown';
	}
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

/**
 * Revoke one session by row id.
 *
 * Marking the row inactive is what the target device reacts to: its watchdog sees the change
 * over Realtime (or on its next focus/interval check) and signs itself out. If the row is this
 * device's own, it signs out here immediately instead of waiting to hear about itself.
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.user) return false;

		const { data, error } = await supabase
			.from('user_sessions')
			.update({ is_active: false })
			.eq('id', sessionId)
			.eq('user_id', session.user.id)
			.select('auth_session_id');

		if (error) {
			console.error('Failed to revoke session:', error);
			return false;
		}

		const revokedOwnSession =
			data?.[0]?.auth_session_id && data[0].auth_session_id === authSessionIdFrom(session);

		if (revokedOwnSession) {
			await supabase.auth.signOut();
		}

		return true;
	} catch (e) {
		console.error('Error revoking session:', e);
		return false;
	}
}

/**
 * Revoke every session except this device's.
 *
 * `scope: 'others'` is the real teeth here — Supabase invalidates the other devices' refresh
 * tokens server-side while leaving this one signed in. Their already-issued access tokens stay
 * valid until they expire, so the rows are also marked inactive to let each device's watchdog
 * sign it out promptly rather than at expiry.
 */
export async function revokeAllOtherSessions(): Promise<boolean> {
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.user) return false;

		const currentAuthSessionId = authSessionIdFrom(session);

		const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
		if (signOutError) {
			console.error('Failed to revoke other sessions with Supabase:', signOutError);
			return false;
		}

		// Without our own session_id there is no way to tell our row apart from the others, and
		// marking rows inactive blind would include this device - whose watchdog would then sign
		// it out. Supabase has already done the real revocation, so stop here instead.
		if (!currentAuthSessionId) return true;

		const { data: rows, error: fetchError } = await supabase
			.from('user_sessions')
			.select('id, auth_session_id')
			.eq('user_id', session.user.id)
			.eq('is_active', true);

		if (fetchError) {
			console.error('Failed to fetch sessions to revoke:', fetchError);
			// The Supabase-side revocation already succeeded, so don't report total failure.
			return true;
		}

		// Filter in code rather than with .neq() so rows with a NULL auth_session_id (written by
		// the pre-migration client) are included instead of silently skipped by SQL NULL logic.
		const idsToRevoke = (rows || [])
			.filter((r) => r.auth_session_id !== currentAuthSessionId)
			.map((r) => r.id);

		if (idsToRevoke.length === 0) return true;

		const { error } = await supabase
			.from('user_sessions')
			.update({ is_active: false })
			.eq('user_id', session.user.id)
			.in('id', idsToRevoke);

		if (error) {
			console.error('Failed to mark other sessions inactive:', error);
		}

		return true;
	} catch (e) {
		console.error('Error revoking other sessions:', e);
		return false;
	}
}

/**
 * Retire this device's row. Call before signOut() on an intentional logout so the session
 * stops appearing as active on the user's other devices.
 */
export async function endCurrentSession(): Promise<void> {
	try {
		const authSessionId = await getCurrentAuthSessionId();
		if (!authSessionId) return;

		const { error } = await supabase
			.from('user_sessions')
			.update({ is_active: false })
			.eq('auth_session_id', authSessionId);

		if (error) console.error('Failed to end current session:', error);
	} catch (e) {
		console.error('Error ending current session:', e);
	}
}

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------

// Locale-specific translations for relative time
const translations: Record<string, Record<string, string>> = {
	en: {
		now: 'Now',
		m_ago: 'm ago',
		h_ago: 'h ago',
		d_ago: 'd ago',
		invalid: 'Invalid date'
	},
	es: {
		now: 'Ahora',
		m_ago: 'hace {0}m',
		h_ago: 'hace {0}h',
		d_ago: 'hace {0}d',
		invalid: 'Fecha inválida'
	},
	fr: {
		now: "À l'instant",
		m_ago: 'il y a {0}m',
		h_ago: 'il y a {0}h',
		d_ago: 'il y a {0}d',
		invalid: 'Date invalide'
	},
	de: {
		now: 'Jetzt',
		m_ago: 'vor {0}m',
		h_ago: 'vor {0}h',
		d_ago: 'vor {0}d',
		invalid: 'Ungültiges Datum'
	}
};

// Get current locale from browser or fallback to 'en'
function getCurrentLocale(): string {
	if (typeof window === 'undefined') return 'en';
	return (navigator.language || 'en').split('-')[0];
}

/**
 * Parse a timestamp that may or may not carry timezone information.
 *
 * last_active is `TIMESTAMP WITH TIME ZONE`, which PostgREST serializes with an explicit
 * offset: `2026-10-31T14:15:22.123456+00:00`. Appending `Z` to that (the old behaviour, applied
 * to anything not already ending in `Z`) produces `+00:00Z`, which no engine can parse — every
 * row rendered "Invalid date". Only stamp UTC on values that genuinely lack a zone.
 */
function parseTimestamp(raw: string): Date {
	const value = raw.trim();

	// Separate the date from the time so the date's own hyphens can't look like an offset.
	const match = value.match(/^(\d{4}-\d{2}-\d{2})[T ](.+)$/);
	if (!match) return new Date(value);

	const [, datePart, timePart] = match;
	const zoneMatch = timePart.match(/(Z|[+-]\d{2}(?::?\d{2})?)$/i);

	// No zone at all: these are stored as UTC, so say so explicitly.
	if (!zoneMatch) return new Date(`${datePart}T${timePart}Z`);

	let zone = zoneMatch[1];
	const body = timePart.slice(0, timePart.length - zone.length);

	// Normalise the offset to ±HH:MM. Postgres' own text output uses a bare ±HH ("+00"), which
	// JS rejects outright, and ±HHMM is inconsistently supported across engines.
	if (/^[+-]\d{2}$/.test(zone)) zone = `${zone}:00`;
	else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;

	return new Date(`${datePart}T${body}${zone}`);
}

// Format relative time with locale support and proper timezone handling
export function formatLastActive(timestamp: string | null | undefined, locale?: string): string {
	if (!timestamp) return 'Unknown';

	try {
		const currentLocale = locale || getCurrentLocale();
		const trans = translations[currentLocale] || translations['en'];

		const then = parseTimestamp(timestamp);

		// Handle invalid dates
		if (isNaN(then.getTime())) {
			console.warn('Invalid timestamp:', timestamp);
			return trans.invalid;
		}

		const now = new Date();
		const diff = now.getTime() - then.getTime();

		// Handle negative differences (clock skew)
		if (diff < 0) {
			return trans.now;
		}

		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return trans.now;
		if (minutes < 60) return trans.m_ago.replace('{0}', minutes.toString());
		if (hours < 24) return trans.h_ago.replace('{0}', hours.toString());
		if (days < 7) return trans.d_ago.replace('{0}', days.toString());

		// For older dates, show localized date
		return then.toLocaleDateString(currentLocale);
	} catch (e) {
		console.error('Error formatting last active:', e, timestamp);
		return 'Unknown';
	}
}

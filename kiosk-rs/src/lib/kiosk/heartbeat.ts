import { supabase } from '$lib/supabase';
import { APP_VERSION } from './version';

/**
 * The device checking in with the server — PLAN.md section 8.
 *
 * This is the return path for everything an admin does to a kiosk from the web app. Revoke
 * and Reset PIN write rows in `kiosk_devices`; without something on the device reading them
 * back, that is all they ever are. A revoked kiosk kept scanning, and a reset PIN worked in
 * the web app while the old one still opened the device.
 *
 * It also writes `last_seen_at` and `app_version`, which is what makes the Devices page able
 * to say whether a kiosk is actually alive rather than just listed.
 *
 * The device authenticates as itself. The action sits above the elevation guard in the edge
 * function precisely because a kiosk has no password to confirm with, and it can only ever
 * read and write the one row matched on `auth_user_id = caller.id`.
 */
export interface Heartbeat {
	/**
	 * Whether a `kiosk_devices` row matches this session.
	 *
	 * False is **not** "revoked". It is a kiosk signed in with a person's account through the
	 * escape hatch in Settings → Account, which has no device row and never will. Treating it
	 * as revoked would sign an admin out mid-event for using a supported feature.
	 */
	paired: boolean;
	status?: 'active' | 'revoked';
	name?: string;
	pinHash?: string;
	pinSalt?: string;
}

export async function sendHeartbeat(): Promise<Heartbeat | null> {
	try {
		// Explicit, like the pairing call. `functions.invoke` resolves the header from an
		// async keyring-backed auth store, and this runs on a timer rather than off a user
		// action - checking the session first also means a signed-out device returns here
		// instead of spending a round trip to be told what it already knows.
		const { data: auth } = await supabase.auth.getSession();
		if (!auth.session) return null;

		const { data, error } = await supabase.functions.invoke('invitation-service', {
			body: { action: 'device-heartbeat', appVersion: APP_VERSION },
			headers: { Authorization: `Bearer ${auth.session.access_token}` }
		});

		if (error) {
			// A kiosk at a door loses its connection routinely. This is a poll - the next one
			// is a minute away - so a failure is noted and never surfaced as an alarm.
			console.warn('[heartbeat] check-in failed', error);
			return null;
		}

		const result = data as Partial<Heartbeat> & { success?: boolean };
		if (!result?.success) return null;

		return {
			paired: result.paired === true,
			status: result.status,
			name: result.name,
			pinHash: result.pinHash,
			pinSalt: result.pinSalt
		};
	} catch (e) {
		console.error('[heartbeat] failed', e);
		return null;
	}
}

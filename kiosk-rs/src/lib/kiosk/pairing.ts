import { PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY } from '$env/static/public';
import { supabase } from '$lib/supabase';
import { storePin, type PinRecord } from './pin';
import { writeDeviceSecret } from './secure-storage';

/**
 * Pairing a kiosk to the system — PLAN.md section 8.
 *
 * Calls the `pair-device` action on the `invitation-service` edge function: the one action
 * reachable without a session, because a kiosk being paired has no account yet. The code
 * itself is the credential — admin-issued, single-use, ten-minute expiry, attempt-counted.
 *
 * What comes back is a full Supabase session plus the PIN the admin set. The session goes
 * into the keyring through the normal auth storage; the PIN hash is stored so the settings
 * gate can verify it offline.
 *
 * The device's **name is supplied here, by whoever is standing at it** — not by the admin
 * issuing the code. They know which door this machine is on; someone in another room is
 * guessing.
 */

/** Crockford base32: no O/0 or I/1/L, because this gets read aloud across a room. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8;

/** Where the device's own id is kept, for the heartbeat. */
export const DEVICE_ID_KEY = 'device-id';

export interface PairResult {
	ok: boolean;
	message?: string;
}

/** Strip the grouping dash and normalise case, so "k7p-4q2m" and "K7P4Q2M" both work. */
export function normaliseCode(input: string): string {
	return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function isValidCodeFormat(code: string): boolean {
	const normalised = normaliseCode(code);
	if (normalised.length !== CODE_LENGTH) return false;
	for (const char of normalised) {
		if (!ALPHABET.includes(char)) return false;
	}
	return true;
}

interface PairResponse {
	deviceId: string;
	session: { access_token: string; refresh_token: string };
	pinHash: string;
	pinSalt: string;
}

export async function pairDevice(code: string, deviceName: string): Promise<PairResult> {
	if (!isValidCodeFormat(code)) {
		return { ok: false, message: 'That code is not valid. Check it and try again.' };
	}
	if (!deviceName.trim()) {
		return { ok: false, message: 'Give this device a name first.' };
	}

	try {
		const { data, error } = await supabase.functions.invoke('invitation-service', {
			body: {
				action: 'pair-device',
				code: normaliseCode(code),
				deviceName: deviceName.trim()
			},
			// The anon key, set explicitly.
			//
			// This is the one call the kiosk makes with no session - that is the point of
			// pairing. supabase-js normally falls back to the anon key for `Authorization`,
			// but this client is built with an async, keyring-backed auth store, and on an
			// unpaired device the header was arriving empty: the function rejected it at its
			// first line with "Authentication header missing". Passing it removes the
			// dependency on when the auth store happens to resolve.
			headers: { Authorization: `Bearer ${PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY}` }
		});

		if (error) {
			// supabase-js collapses a non-2xx into a generic message; the real one is in the body.
			let message = 'Pairing failed. Check the code and the connection.';
			try {
				const body = await (error as { context?: Response }).context?.json();
				if (body?.error) message = body.error;
			} catch {
				/* keep the generic message */
			}
			return { ok: false, message };
		}

		const result = data as PairResponse | { error?: string };
		if ('error' in result && result.error) return { ok: false, message: result.error };

		const paired = result as PairResponse;

		// Adopt the device's session. This writes through the encrypted keyring-backed
		// storage in supabase.ts, so the refresh token is never left in plain localStorage.
		const { error: sessionError } = await supabase.auth.setSession({
			access_token: paired.session.access_token,
			refresh_token: paired.session.refresh_token
		});
		if (sessionError) {
			return { ok: false, message: 'Paired, but the session could not be stored.' };
		}

		// Without these the device has no way to verify the PIN, and the confirm step would
		// reject every entry while blaming the installer. An older deployment of the function
		// that does not return them has to say so here, not three screens later.
		if (!paired.pinHash || !paired.pinSalt) {
			return {
				ok: false,
				message: 'The server did not send a PIN for this device. Deploy the latest invitation-service function, then pair again.'
			};
		}

		const record: PinRecord = { hash: paired.pinHash, salt: paired.pinSalt };
		if (!(await storePin(record))) {
			return {
				ok: false,
				message: 'Paired, but the PIN could not be saved on this device. Revoke it in the web app and pair again.'
			};
		}
		await writeDeviceSecret(DEVICE_ID_KEY, paired.deviceId);

		return { ok: true };
	} catch (e) {
		console.error('[pairing] failed', e);
		return { ok: false, message: 'Could not reach the server. Check the connection.' };
	}
}

/** No longer a stub: the screen stops warning about it. */
export const PAIRING_IS_STUBBED = false;

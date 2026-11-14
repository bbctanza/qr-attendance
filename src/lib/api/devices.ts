import { supabase } from '$lib/supabase';
import { elevation } from '$lib/stores/elevation';

/**
 * Kiosk device pairing — see kiosk-rs/PLAN.md section 8.
 *
 * Replaces signing a kiosk in with an invited staff account. A kiosk is a device the
 * organisation owns, not a person: pairing is a one-use code, each device gets its own hidden
 * identity, and revoking one affects nothing else.
 *
 * The PIN is hashed **here, in the browser**, and only the hash and salt ever leave. The
 * server has no use for the PIN itself, and a PIN that never travels cannot be logged.
 */

const FUNCTION_NAME = 'invitation-service';

export interface KioskDevice {
	id: string;
	name: string;
	status: 'active' | 'revoked';
	paired_at: string;
	paired_by_email: string | null;
	last_seen_at: string | null;
	app_version: string | null;
	revoked_at: string | null;
}

export interface PairingCode {
	code: string;
	created_at: string;
	created_by_email: string | null;
	expires_at: string;
	consumed_at: string | null;
	consumed_by: string | null;
}

/** What a code is doing right now, derived rather than stored - expiry is just a clock. */
export type CodeState = 'paired' | 'waiting' | 'expired';

export function codeState(code: PairingCode, now = Date.now()): CodeState {
	if (code.consumed_at) return 'paired';
	return new Date(code.expires_at).getTime() < now ? 'expired' : 'waiting';
}

export class DeviceApiError extends Error {
	constructor(
		message: string,
		readonly code: string
	) {
		super(message);
		this.name = 'DeviceApiError';
	}
}

interface CallOptions {
	/**
	 * Attach the held elevation token. Required for anything that creates or revokes a
	 * device, which the service treats as an access change like inviting or removing a user.
	 * Reading the list is not one, so it does not carry this.
	 */
	elevated?: boolean;
}

async function call<T>(
	action: string,
	payload: Record<string, unknown> = {},
	options: CallOptions = {}
): Promise<T> {
	// `functions.invoke` falls back to the anon key when no session is loaded, and the service
	// answers that with a bare 401 that reads as "the feature is broken" rather than "you are
	// not signed in". A page can mount before the session has hydrated, so check first.
	const { data: auth } = await supabase.auth.getSession();
	if (!auth.session) {
		throw new DeviceApiError(
			'Your session has not loaded yet. Refresh the page, or sign in again.',
			'unauthenticated'
		);
	}

	const body: Record<string, unknown> = { action, ...payload };

	if (options.elevated) {
		const token = elevation.current();
		// Short-circuit rather than spend a round-trip to be told what we already know.
		if (!token) {
			throw new DeviceApiError(
				'Confirm your identity before changing kiosk devices.',
				'elevation_required'
			);
		}
		body.elevation = token;
	}

	const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

	if (error) {
		// supabase-js collapses a non-2xx into "Edge Function returned a non-2xx status code",
		// which tells an admin nothing; the real message is in the response body.
		let message = error.message;
		let code = 'device_error';
		try {
			const body = await (error as { context?: Response }).context?.json();
			if (body?.error) message = body.error;
			if (body?.code) code = body.code;
		} catch {
			/* keep the generic message */
		}
		if (code === 'unknown_action') {
			// The function predates these actions - almost always "not redeployed yet".
			throw new DeviceApiError(
				'The server does not know about kiosk devices yet. Deploy the invitation-service function.',
				code
			);
		}
		throw new DeviceApiError(message, code);
	}
	if ((data as { error?: string })?.error) {
		throw new DeviceApiError(
			(data as { error: string }).error,
			(data as { code?: string }).code ?? 'device_error'
		);
	}
	return data as T;
}

/** PBKDF2-SHA256, matching the kiosk's own `pin.ts` exactly — both sides must agree. */
const PIN_ITERATIONS = 150_000;

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string): Promise<{ pinHash: string; pinSalt: string }> {
	const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(pin),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations: PIN_ITERATIONS, hash: 'SHA-256' },
		key,
		256
	);
	return { pinHash: toHex(new Uint8Array(bits)), pinSalt: toHex(salt) };
}

export const devicesApi = {
	async list(): Promise<KioskDevice[]> {
		const data = await call<{ devices: KioskDevice[] }>('list-devices');
		return data.devices ?? [];
	},

	/**
	 * No device name here: the kiosk supplies it when it pairs. Whoever is standing at the
	 * machine knows which door it is on.
	 */
	async createPairingCode(pin: string) {
		const { pinHash, pinSalt } = await hashPin(pin);
		return call<{ code: string; expiresAt: string }>(
			'create-pairing-code',
			{ pinHash, pinSalt },
			{ elevated: true }
		);
	},

	async listCodes(): Promise<PairingCode[]> {
		const data = await call<{ codes: PairingCode[] }>('list-pairing-codes');
		return data.codes ?? [];
	},

	async rename(deviceId: string, name: string) {
		return call<{ success: true }>('rename-device', { deviceId, name }, { elevated: true });
	},

	async resetPin(deviceId: string, pin: string) {
		const { pinHash, pinSalt } = await hashPin(pin);
		return call<{ success: true }>(
			'reset-device-pin',
			{ deviceId, pinHash, pinSalt },
			{ elevated: true }
		);
	},

	async revoke(deviceId: string) {
		return call<{ success: true; revoked: { name: string } }>(
			'revoke-device',
			{ deviceId },
			{ elevated: true }
		);
	}
};

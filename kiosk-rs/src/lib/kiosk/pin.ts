import { readDeviceSecret, writeDeviceSecret, clearDeviceSecret } from './secure-storage';

/**
 * The device PIN that opens Kiosk Settings — see PLAN.md section 8.5.
 *
 * It replaces typing a full account password at a door, which was wrong twice over: it is
 * slow on a touch keyboard, and it exposes a credential that unlocks the whole web app to
 * whoever is standing in the queue. This PIN opens *this device's settings* and nothing else,
 * which is the same reason a bank can get away with four digits.
 *
 * Verified entirely on-device against a stored hash, so Settings still opens with the network
 * down — a kiosk whose connection has dropped is exactly when someone needs to get in.
 */

const PIN_LENGTH = 6;
const ITERATIONS = 150_000;
const SECRET_KEY = 'device-pin';

/** Five tries, then a cooldown that doubles. Enough to stop guessing, not enough to lock out
 *  staff who fat-fingered it twice on a touch screen. */
const MAX_ATTEMPTS = 5;
const BASE_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

/** Persisted, so a reboot is not a way around the cooldown. */
const LOCKOUT_KEY = 'kiosk.pinLockout';

export interface PinRecord {
	hash: string;
	salt: string;
}

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
	for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

export function isValidPinFormat(pin: string): boolean {
	// Deliberately not a regex built from a template literal: `\d` inside one collapses to a
	// plain `d`, which silently produced /^d{6}$/ and rejected every real PIN.
	if (pin.length !== PIN_LENGTH) return false;
	for (const char of pin) {
		if (char < '0' || char > '9') return false;
	}
	return true;
}

/** PBKDF2-SHA256. Slow on purpose: the whole keyspace is a million combinations. */
async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(pin),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
		key,
		256
	);
	return toHex(new Uint8Array(bits));
}

export async function hashPin(pin: string, saltHex?: string): Promise<PinRecord> {
	const salt = saltHex
		? fromHex(saltHex)
		: crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
	return { hash: await derive(pin, salt), salt: toHex(salt) };
}

/**
 * Constant-time-ish comparison. The timing of a string compare on a hex digest is not a
 * realistic attack here, but there is no reason to leak it either.
 */
function sameHash(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function matchesPin(pin: string, record: PinRecord): Promise<boolean> {
	if (!isValidPinFormat(pin)) return false;
	const { hash } = await hashPin(pin, record.salt);
	return sameHash(hash, record.hash);
}

// ---------------------------------------------------------------------------
// Stored record
// ---------------------------------------------------------------------------

/** False when the device could not keep the record - see `writeDeviceSecret`. */
export async function storePin(record: PinRecord): Promise<boolean> {
	return writeDeviceSecret(SECRET_KEY, JSON.stringify(record));
}

export async function loadPin(): Promise<PinRecord | null> {
	const raw = await readDeviceSecret(SECRET_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<PinRecord>;
		if (typeof parsed.hash !== 'string' || typeof parsed.salt !== 'string') return null;
		return { hash: parsed.hash, salt: parsed.salt };
	} catch {
		return null;
	}
}

export async function clearPin(): Promise<void> {
	await clearDeviceSecret(SECRET_KEY);
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

interface Lockout {
	failures: number;
	until: number;
}

function readLockout(): Lockout {
	if (typeof localStorage === 'undefined') return { failures: 0, until: 0 };
	try {
		const raw = localStorage.getItem(LOCKOUT_KEY);
		if (!raw) return { failures: 0, until: 0 };
		const parsed = JSON.parse(raw) as Partial<Lockout>;
		return {
			failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
			until: typeof parsed.until === 'number' ? parsed.until : 0
		};
	} catch {
		return { failures: 0, until: 0 };
	}
}

function writeLockout(state: Lockout) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
	} catch (e) {
		console.error('[pin] could not persist lockout', e);
	}
}

/** Milliseconds until another attempt is allowed. 0 means try now. */
export function lockedForMs(now = Date.now()): number {
	return Math.max(0, readLockout().until - now);
}

/** Record a wrong PIN and return how long the device is now locked for. */
export function registerFailure(now = Date.now()): number {
	const state = readLockout();
	const failures = state.failures + 1;

	if (failures < MAX_ATTEMPTS) {
		writeLockout({ failures, until: state.until });
		return 0;
	}

	// Each lockout past the threshold doubles, to a ceiling.
	const over = failures - MAX_ATTEMPTS;
	const cooldown = Math.min(BASE_COOLDOWN_MS * 2 ** over, MAX_COOLDOWN_MS);
	writeLockout({ failures, until: now + cooldown });
	return cooldown;
}

/** A correct PIN wipes the record entirely - the count is about guessing, not history. */
export function clearFailures() {
	writeLockout({ failures: 0, until: 0 });
}

export function attemptsRemaining(): number {
	return Math.max(0, MAX_ATTEMPTS - readLockout().failures);
}

export const PIN_DIGITS = PIN_LENGTH;

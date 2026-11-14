import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Where the kiosk's Supabase session lives.
 *
 * **Why this is an envelope scheme and not just "put the session in the keyring".**
 * The first attempt did exactly that, and it silently logged the device out on every restart.
 * Windows' Credential Manager refuses any secret over 2560 UTF-16 characters (measured — see
 * the regression test in `src-tauri/src/secrets.rs`), and a Supabase session is 2-5 KB of
 * access JWT, refresh token and user object. Every write failed; nothing read it back.
 *
 * So the credential store holds a 32-byte AES key — comfortably under the limit — and the
 * session itself is encrypted with it and kept in localStorage. The security property is the
 * one that mattered anyway: the token at rest on disk is useless without the key, and the key
 * is in the OS store rather than in the app's own data directory.
 *
 * Outside Tauri it is plain localStorage, because `pnpm dev` in a browser has no credential
 * store and the whole scan flow is still developed there.
 */

const KEY_NAME = 'session-encryption-key';
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

// Backed by an explicit ArrayBuffer: WebCrypto's BufferSource will not accept a Uint8Array
// whose buffer type is only known as ArrayBufferLike.
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** WebCrypto needs a secure context. Tauri's localhost origin is one; guard anyway. */
const cryptoAvailable = typeof crypto !== 'undefined' && !!crypto.subtle;

let keyPromise: Promise<CryptoKey | null> | null = null;

/**
 * Fetch the device's key from the credential store, generating and storing one on first run.
 *
 * Resolved once and cached: every session read would otherwise cross the IPC boundary.
 */
function getKey(): Promise<CryptoKey | null> {
	keyPromise ??= (async () => {
		try {
			let raw = await invoke<string | null>('secret_get', { key: KEY_NAME });

			if (!raw) {
				const generated = crypto.getRandomValues(new Uint8Array(32));
				raw = toBase64(generated);
				await invoke('secret_set', { key: KEY_NAME, value: raw });
			}

			return await crypto.subtle.importKey('raw', fromBase64(raw), 'AES-GCM', false, [
				'encrypt',
				'decrypt'
			]);
		} catch (e) {
			console.error('[secure-storage] no encryption key available', e);
			return null;
		}
	})();
	return keyPromise;
}

async function encrypt(plain: string): Promise<string | null> {
	const key = await getKey();
	if (!key) return null;

	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const cipher = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
	);

	// iv || ciphertext, so one string round-trips through localStorage.
	const packed = new Uint8Array(new ArrayBuffer(iv.length + cipher.length));
	packed.set(iv, 0);
	packed.set(cipher, iv.length);
	return toBase64(packed);
}

async function decrypt(packed: string): Promise<string | null> {
	const key = await getKey();
	if (!key) return null;

	try {
		const bytes = fromBase64(packed);
		const iv = bytes.slice(0, IV_BYTES);
		const cipher = bytes.slice(IV_BYTES);
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
		return new TextDecoder().decode(plain);
	} catch (e) {
		// A key that no longer matches the stored blob (credential store cleared, app
		// reinstalled) is a signed-out device, not a crash. One sign-in puts it right.
		console.warn('[secure-storage] stored session could not be decrypted; treating as none', e);
		return null;
	}
}

function readLocal(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeLocal(key: string, value: string): boolean {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch (e) {
		console.error('[secure-storage] localStorage write failed', e);
		return false;
	}
}

function removeLocal(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch (e) {
		console.error('[secure-storage] localStorage delete failed', e);
	}
}

/** True when the session is encrypted under a key held by the OS, for the About screen. */
export const usingKeyring = isTauri() && cryptoAvailable;

/**
 * The storage object handed to `createClient`.
 *
 * Chosen once at module load, not per call: switching stores mid-session would strand a token
 * in whichever one it was written to.
 */
export const sessionStorageAdapter = usingKeyring
	? {
			async getItem(key: string) {
				const stored = readLocal(key);
				return stored === null ? null : await decrypt(stored);
			},
			async setItem(key: string, value: string) {
				const sealed = await encrypt(value);
				// Falling back to plaintext would quietly downgrade the guarantee the About
				// screen is claiming, so a failure drops the stored session instead.
				if (sealed === null) {
					console.error('[secure-storage] could not encrypt the session; not storing it');
					removeLocal(key);
					return;
				}
				writeLocal(key, sealed);
			},
			async removeItem(key: string) {
				removeLocal(key);
			}
		}
	: {
			getItem: (key: string) => readLocal(key),
			// The boolean is dropped on purpose: Supabase's storage contract wants void, and a
			// failed session write is already handled by the client re-authenticating.
			setItem: (key: string, value: string) => {
				writeLocal(key, value);
			},
			removeItem: (key: string) => removeLocal(key)
		};

/**
 * Small per-device secrets that are not the Supabase session: the PIN hash and salt.
 *
 * These go straight into the credential store rather than through the envelope above - they
 * are tens of characters, nowhere near the 2560-character platform limit, and a hash is
 * already not a secret in the way a refresh token is.
 */
export async function readDeviceSecret(key: string): Promise<string | null> {
	if (isTauri()) {
		try {
			return (await invoke<string | null>('secret_get', { key })) ?? null;
		} catch (e) {
			console.error('[secure-storage] device secret read failed', e);
			return null;
		}
	}
	return readLocal(`kiosk.secret.${key}`);
}

/**
 * Reports whether the write landed.
 *
 * It used to swallow the error and return `void`, which hid the one failure that matters:
 * if the credential store refuses the write during pairing, no PIN record exists, and the
 * confirm step then tells the installer their PIN is wrong - every time, with nothing to
 * distinguish "you typed it wrong" from "this device never received it".
 */
export async function writeDeviceSecret(key: string, value: string): Promise<boolean> {
	if (isTauri()) {
		try {
			await invoke('secret_set', { key, value });
			return true;
		} catch (e) {
			console.error('[secure-storage] device secret write failed', e);
			return false;
		}
	}
	return writeLocal(`kiosk.secret.${key}`, value);
}

export async function clearDeviceSecret(key: string): Promise<void> {
	if (isTauri()) {
		try {
			await invoke('secret_delete', { key });
			return;
		} catch (e) {
			console.error('[secure-storage] device secret delete failed', e);
			return;
		}
	}
	removeLocal(`kiosk.secret.${key}`);
}

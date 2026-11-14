import { verifyPassword } from './auth';
import { clearFailures, loadPin, lockedForMs, matchesPin, registerFailure } from './pin';

/**
 * Elevation ("sudo mode") for the kiosk.
 *
 * Much smaller than the web app's `src/lib/stores/elevation.ts`, and deliberately so. That one
 * exchanges the password for a server-signed token because it authorises *server* actions
 * (changing roles, revoking invites) that must be proven to the backend. The kiosk's gate
 * authorises nothing on the server - it only decides whether this device shows its Settings
 * screen or leaves kiosk mode. A local yes/no is the whole requirement, so there is no token.
 *
 * Two kiosk-specific choices:
 *
 * - **In memory only.** Same reasoning as the web app: persisting it would let elevation
 *   survive a restart. On an unattended device that is worse, not better.
 * - **A hold the operator sets.** Originally this was two minutes AND cleared whenever
 *   Settings closed, which defeated the point: stepping out to check a scan and going back in
 *   meant typing the password again every time. The hold now survives leaving the screen and
 *   lasts for `settings.elevationMinutes` (0 = ask every time).
 *
 *   Counted from when the password was entered, not from the last interaction, so the window
 *   cannot be extended indefinitely by popping in and out - and so an unattended device is
 *   never unlocked for longer than the operator chose.
 */

let heldUntil = 0;

/** True while Settings can be opened without a password. */
export function isHeld(): boolean {
	return heldUntil > Date.now();
}

/**
 * Check a password and, on success, start the hold.
 *
 * Returns false for a wrong password *and* for a device that isn't signed in - there is no
 * account to check against, and failing closed is the only safe answer.
 */
/**
 * Unlock with the device PIN.
 *
 * Verified against the locally stored hash, so Settings opens with the network down - which
 * is exactly when someone needs to get in. Returns how long the device is locked for when
 * the attempt is refused, so the screen can say so rather than just failing.
 */
export async function elevateWithPin(
	pin: string,
	holdMinutes: number
): Promise<{ ok: boolean; lockedForMs: number }> {
	const locked = lockedForMs();
	if (locked > 0) return { ok: false, lockedForMs: locked };

	const record = await loadPin();
	if (!record) return { ok: false, lockedForMs: 0 };

	if (await matchesPin(pin, record)) {
		clearFailures();
		heldUntil = holdMinutes > 0 ? Date.now() + holdMinutes * 60_000 : 0;
		return { ok: true, lockedForMs: 0 };
	}

	return { ok: false, lockedForMs: registerFailure() };
}

/** True once a PIN has been set on this device, so the gate knows which form to show. */
export async function hasPin(): Promise<boolean> {
	return (await loadPin()) !== null;
}

export async function elevate(password: string, holdMinutes: number): Promise<boolean> {
	if (!password) return false;

	const ok = await verifyPassword(password);
	if (ok) heldUntil = holdMinutes > 0 ? Date.now() + holdMinutes * 60_000 : 0;
	return ok;
}

/** Seconds left on the hold, for the settings screen to show. 0 when nothing is held. */
export function remainingSeconds(): number {
	return Math.max(0, Math.ceil((heldUntil - Date.now()) / 1000));
}

/** Drop elevation. Called when the account changes - a new identity must re-authenticate. */
export function release() {
	heldUntil = 0;
}

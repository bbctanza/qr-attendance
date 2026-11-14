/**
 * Developer tools, mirroring the web app's `/settings/dev` ("Developer Tools — Debug & test
 * features", gated on `role === 'Developer'`).
 *
 * The kiosk's version carries the same `bypassEventTimeValidation` flag with the same two
 * meanings it has in the web app — scan without a live event, and **never write to the
 * database while it is on** — plus the things only a kiosk needs: forcing the offline path,
 * and previewing a result card without a real scan.
 *
 * Kept out of `KioskSettings` on purpose. These are not preferences; they must never be
 * exported, synced, or quietly left on after a restart, which is why the flags that change
 * behaviour reset on boot rather than persisting.
 */

const STORAGE_KEY = 'kiosk.dev';

interface DevState {
	/**
	 * Scan with no ongoing event, and mock the result instead of calling the RPC.
	 *
	 * Persisted, as the web app persists `dev_bypass_time`, and cleared on sign-out the same
	 * way. An earlier version here reset it on every reload, which made it useless to actually
	 * develop against. The TEST MODE banner in the status strip is what keeps a kiosk left in
	 * this state from being mistaken for a working one.
	 */
	bypassEventTimeValidation: boolean;
	/** Pretend the network is down, to exercise the offline queue without unplugging. */
	forceOffline: boolean;
	/** Persisted: harmless, and useful to keep the menu open across a reload while debugging. */
	panelPinned: boolean;
	/**
	 * Whether Developer Tools is visible at all.
	 *
	 * Unlocked by tapping the version seven times, as Android does, and NOT by the signed-in
	 * account's role. Debugging should not require swapping the kiosk account, because that
	 * changes who scans are recorded as - the audit trail should not be the price of a test
	 * flag. Settings is already behind the elevation password, so this is a second gate inside
	 * one rather than the only lock.
	 */
	unlocked: boolean;
	/**
	 * Where the floating dev button sits, as fractions of the free space (0-1), not pixels.
	 *
	 * A kiosk is the one app guaranteed to change resolution under you - it is fullscreened
	 * onto whatever display it is plugged into. Pixels saved on a 1920-wide screen put the
	 * button off the edge of a 1366-wide one; fractions survive it.
	 */
	fabX: number;
	fabY: number;
}

/** Taps needed, and the point at which Android starts counting down out loud. */
const TAPS_TO_UNLOCK = 7;
const COUNTDOWN_FROM = 4;
/** A pause longer than this starts the count again, so stray taps never accumulate. */
const TAP_RESET_MS = 2000;

/** A stored position that is missing, not a number, or out of range falls back. */
function clamp01(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(1, Math.max(0, value));
}

function load(): DevState {
	const base: DevState = {
		bypassEventTimeValidation: false,
		forceOffline: false,
		panelPinned: false,
		unlocked: false,
		// Lower left by default: the settings gear owns the lower right, and a kiosk's scan
		// content is centred, so the left margin is the empty corner.
		fabX: 0.04,
		fabY: 0.78
	};
	if (typeof localStorage === 'undefined') return base;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return base;
		const parsed = JSON.parse(raw) as Partial<DevState>;
		return {
			bypassEventTimeValidation: parsed.bypassEventTimeValidation === true,
			forceOffline: parsed.forceOffline === true,
			panelPinned: parsed.panelPinned === true,
			unlocked: parsed.unlocked === true,
			fabX: clamp01(parsed.fabX, base.fabX),
			fabY: clamp01(parsed.fabY, base.fabY)
		};
	} catch {
		return base;
	}
}

class DevTools {
	state = $state<DevState>(load());

	private taps = 0;
	private lastTap = 0;

	get bypass() {
		return this.state.bypassEventTimeValidation;
	}

	get forceOffline() {
		return this.state.forceOffline;
	}

	setBypass(on: boolean) {
		this.state.bypassEventTimeValidation = on;
		this.persist();
	}

	setForceOffline(on: boolean) {
		this.state.forceOffline = on;
		this.persist();
	}

	setPinned(on: boolean) {
		this.state.panelPinned = on;
		this.persist();
	}

	get fab() {
		return { x: this.state.fabX, y: this.state.fabY };
	}

	setFabPosition(x: number, y: number) {
		this.state.fabX = Math.min(1, Math.max(0, x));
		this.state.fabY = Math.min(1, Math.max(0, y));
		this.persist();
	}

	get unlocked() {
		return this.state.unlocked;
	}

	/**
	 * Register a tap on the version row. Returns what the UI should say, or null for the
	 * early taps where Android stays silent.
	 */
	tapVersion(): { message: string; unlocked: boolean } | null {
		if (this.state.unlocked) {
			return { message: 'Developer tools are already on.', unlocked: true };
		}

		const now = Date.now();
		if (now - this.lastTap > TAP_RESET_MS) this.taps = 0;
		this.lastTap = now;
		this.taps += 1;

		if (this.taps >= TAPS_TO_UNLOCK) {
			this.taps = 0;
			this.state.unlocked = true;
			this.persist();
			return { message: 'You are now a developer!', unlocked: true };
		}

		const remaining = TAPS_TO_UNLOCK - this.taps;
		if (this.taps >= COUNTDOWN_FROM) {
			return {
				message: `You are now ${remaining} step${remaining === 1 ? '' : 's'} away from being a developer.`,
				unlocked: false
			};
		}
		return null;
	}

	/** Turn developer tools back off, as Android's own switch does. Also clears the flags. */
	lock() {
		this.state.unlocked = false;
		this.state.bypassEventTimeValidation = false;
		this.state.forceOffline = false;
		this.persist();
	}

	/** Clear the behaviour flags on sign-out, as the web app's protected layout does.
	 *  The unlock itself survives: it belongs to the device, not to the account. */
	reset() {
		this.state.bypassEventTimeValidation = false;
		this.state.forceOffline = false;
		this.persist();
	}

	private persist() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
		} catch (e) {
			console.error('[dev] could not persist', e);
		}
	}
}

export const dev = new DevTools();

import type { KioskEvent, KioskSettings, ScanResult, Screen, SharedSettings } from './types';
import { attendanceApi, type KioskEventRow, type ScanRpcResult } from '$lib/api/attendance';
import { offlineQueue } from './offline-queue';
import { currentIdentity, signOut, type KioskIdentity } from './auth';
import { clearPin } from './pin';
import { SHARED_DEFAULTS, applySharedSettings, loadSharedSettings } from './settings';
import { readShellState, setAutostart, setFullscreen, supported as shellSupported } from './shell';
import { loadSettings as loadStoredSettings, saveSettings as persistSettings } from './settings-store';
import { dev } from './dev.svelte';
import { supabase } from '$lib/supabase';
import { setBeepVolume } from './beep';
import {
	playAccepted,
	playDuplicate,
	playError,
	playQueued,
	playRejected,
	playSuccess
} from './beep';

/**
 * Kiosk runtime state.
 *
 * This is the only place that talks to the outside world; every component reads from the
 * `kiosk` singleton and nothing else. Day 2 swapped `mock.ts` for the real Supabase RPCs
 * behind this same surface - `mock.ts` is left on disk so the UI can still be demoed without
 * a database, but nothing imports it.
 *
 * Scans are serialized through one promise chain: a USB scanner fires in milliseconds while
 * the RPC takes seconds, and two overlapping check-ins would race on `activeEvent.checked_in`
 * and on the result flood. This mirrors what the web app's scanQueue.ts does, minus the
 * Svelte-store plumbing the kiosk doesn't need.
 */

/** How often to re-check which event is ongoing. */
const EVENT_POLL_MS = 60_000;

/** How often to refresh the live checked-in count while an event is running. */
const COUNT_POLL_MS = 15_000;

/**
 * How often to retry a backlog while the device is online.
 *
 * Without this a flush that fails *without the connection dropping* - a 500, an expired
 * token, one bad row - leaves the remainder queued with nothing scheduled to try again.
 * `navigator.onLine` never fires, because nothing ever went offline, so on an unattended
 * device the backlog would sit until someone happened to open Settings and tap Retry.
 */
const QUEUE_RETRY_MS = 30_000;

/**
 * The part of the settings that is actually saved. Fullscreen and start-on-boot live in the
 * operating system, not in this object - see settings-store.ts.
 */
function savable(settings: KioskSettings) {
	const { fullscreenLock: _fs, startOnBoot: _sb, ...rest } = settings;
	return rest;
}

/**
 * Factory, not a shared object: every caller gets its own copy, and the merge base for
 * `loadStoredSettings` never comes from live reactive state. Reading `settings` to produce
 * the next `settings` is what made `start()` loop when it was called from an `$effect`.
 */
function defaultSettings(): KioskSettings {
	return {
		deviceName: 'Main Gate — Laptop 1',
		theme: 'light',
		fullscreenLock: true,
		startOnBoot: true,
		usbScanner: true,
		camera: false,
		cameraId: null,
		cameraMirrored: false,
		cameraFullscreen: false,
		cameraGuidePosition: 'top',
		cameraGuideIdleTime: 5,
		cameraWideScan: false,
		timeFormat: '24h',
		elevationMinutes: 5,
		debounceSeconds: 8,
		beepVolume: 70,
		pinnedEventId: null
	};
}

function toKioskEvent(row: KioskEventRow, checkedIn = 0): KioskEvent {
	return {
		event_id: row.event_id,
		event_name: row.event_name,
		start_datetime: row.start_datetime,
		checked_in: checkedIn
	};
}

class KioskRuntime {
	now = $state(new Date());
	screen = $state<Screen>('scan');
	/** Raw connectivity. Read `connected` instead - the dev tools can force it false. */
	online = $state(true);
	queued = $state(0);

	activeEvent = $state<KioskEvent | null>(null);
	nextEvent = $state<KioskEvent | null>(null);
	result = $state<ScanResult | null>(null);

	/** Ongoing events, for the "pin to a specific event" picker in Settings. */
	ongoing = $state<KioskEvent[]>([]);

	/** Set when the last attempt to reach Supabase failed, so the strip can say why. */
	lastError = $state<string | null>(null);

	/** Signed-in account, or null when the device still needs first-boot setup. */
	identity = $state<KioskIdentity | null>(null);

	/** False until the stored session has been checked, so the UI doesn't flash the setup screen. */
	authChecked = $state(false);

	/** True when running inside Tauri, so the UI can disable what a browser can't do. */
	readonly shell = shellSupported;

	/**
	 * The settings screen edits a draft, not the live settings, so nothing takes effect until
	 * Save. Null whenever the screen is closed.
	 *
	 * Theme is the exception: it previews live, because a colour scheme you cannot see until
	 * you commit is not a choice you can make. Discarding reverts it.
	 */
	draft = $state<KioskSettings | null>(null);

	/** Armed by a first Back press while dirty; a second press then discards and leaves. */
	backArmed = $state(false);

	/**
	 * True while the draft differs from what is saved.
	 *
	 * Fullscreen and start-on-boot are excluded: they are OS actions that take effect the
	 * instant they are toggled, so they are never "unsaved". Comparing them would light up
	 * the save bar the moment someone flips fullscreen, and then saving would write the
	 * draft's stale copy back over what the OS actually reports.
	 */
	get dirty() {
		if (!this.draft) return false;
		return JSON.stringify(savable(this.draft)) !== JSON.stringify(savable(this.settings));
	}

	settings = $state<KioskSettings>(defaultSettings());

	/** Mirrors the web app's system_settings row. Loaded on boot, never written here. */
	shared = $state<SharedSettings>({ ...SHARED_DEFAULTS });

	/** Codes seen recently, for the debounce window. */
	private recent = new Map<string, number>();
	private resultTimer: ReturnType<typeof setTimeout> | null = null;
	/** Tail of the scan chain, so check-ins run strictly one at a time. */
	private chain: Promise<unknown> = Promise.resolve();
	private timers: ReturnType<typeof setInterval>[] = [];
	/**
	 * Generation counter for event refreshes. Three callers can start one (the 60 s poll, the
	 * `online` handler, `beginSession`), and a slower request that *started* earlier can land
	 * later and overwrite fresher data. Only the newest refresh is allowed to apply.
	 */
	private eventsSeq = 0;
	private started = false;

	/** What the rest of the app should treat as "online". */
	get connected() {
		return this.online && !dev.forceOffline;
	}

	/** True when an event is running, so the scanner should be live. */
	get scanning() {
		return this.activeEvent !== null;
	}

	/**
	 * Call once on mount. Restores the stored session, then loads events and starts polling.
	 *
	 * Nothing is fetched before the session is restored: the scan RPC and the events table are
	 * both behind RLS, so an anonymous request just fails and would put a spurious error on
	 * the status strip for the first second of boot.
	 */
	async start() {
		// Idempotent: a double mount must not restart polling or re-merge settings.
		if (this.started) return;
		this.started = true;

		this.queued = offlineQueue.size();
		this.settings = loadStoredSettings(defaultSettings());
		this.loadDevicePrefs();
		setBeepVolume(this.settings.beepVolume);
		this.applyTheme();
		await this.syncShellState();

		// Before the auth check on purpose: system_settings is readable by `anon`, so the
		// organisation's name can be on the first-boot sign-in screen rather than a placeholder.
		await this.refreshShared();

		// Clear the developer flags on sign-out, exactly as the web app's protected layout does.
		supabase.auth.onAuthStateChange((event) => {
			if (event === 'SIGNED_OUT') dev.reset();
		});

		this.identity = await currentIdentity();
		this.authChecked = true;
		if (!this.identity) return;

		await this.beginSession();
	}

	/**
	 * Re-read the web app's settings row. Also called on each event poll, so a change made in
	 * App Settings reaches the device without restarting it.
	 */
	async refreshShared() {
		const loaded = await loadSharedSettings();
		if (loaded) this.shared = loaded;
		applySharedSettings(this.shared, this.settings.theme === 'dark');
	}

	/**
	 * Device-local preferences the web app also keeps per device. Same localStorage keys, so a
	 * machine that ran the web app keeps its clock format.
	 */
	private loadDevicePrefs() {
		if (typeof localStorage === 'undefined') return;
		this.settings.timeFormat = localStorage.getItem('time_format') === '12h' ? '12h' : '24h';
	}

	/**
	 * Take up the session a first-boot screen has just established.
	 *
	 * This exists because `beginSession()` alone was not enough, and the gap was invisible:
	 * it starts the timers but never touches `identity`, while the first-boot screens are
	 * rendered by `!kiosk.identity`. The sign-in screen happened to assign `identity` itself,
	 * so it worked; pairing did not, so a device that paired successfully and confirmed its
	 * PIN sat on the confirm step forever - and the code it had already consumed then read as
	 * "not valid" on the next try, which looks exactly like a connection fault.
	 *
	 * Returns false when the session did not resolve to something that can scan, so the screen
	 * can say so rather than silently staying put.
	 */
	async adoptSession(identity?: KioskIdentity | null): Promise<boolean> {
		this.identity = identity ?? (await currentIdentity());
		this.authChecked = true;
		if (!this.identity) return false;

		await this.beginSession();
		return true;
	}

	/** Start polling and sync. Called after boot, and again after a first-boot sign-in. */
	async beginSession() {
		await this.refreshEvents();
		if (this.connected) void this.flushQueue();

		// Clear first so a sign-in after boot can't leave two sets of timers running.
		this.stop();
		this.timers.push(
			setInterval(() => {
				void this.refreshEvents();
				void this.refreshShared();
			}, EVENT_POLL_MS)
		);
		this.timers.push(setInterval(() => void this.refreshCount(), COUNT_POLL_MS));
		this.timers.push(
			setInterval(() => {
				if (this.connected && this.queued > 0) void this.flushQueue();
			}, QUEUE_RETRY_MS)
		);
	}

	/** True when the device is signed in with an account that can actually record scans. */
	get ready() {
		return this.identity !== null && this.identity.role !== null;
	}

	stop() {
		for (const id of this.timers) clearInterval(id);
		this.timers = [];
		this.started = false;
	}

	/** Which event scans go into: the pinned one if set, else the first ongoing one. */
	private pickActive(rows: KioskEventRow[]): KioskEventRow | null {
		if (rows.length === 0) return null;
		const pinned = this.settings.pinnedEventId;
		if (pinned !== null) {
			return rows.find((row) => row.event_id === pinned) ?? null;
		}
		return rows[0];
	}

	async refreshEvents() {
		const seq = ++this.eventsSeq;
		try {
			// Before reading: statuses only advance when a client asks. See the API comment.
			await attendanceApi.refreshEventStatuses();

			const [ongoingRows, upcomingRows] = await Promise.all([
				attendanceApi.getOngoingEvents(),
				attendanceApi.getUpcomingEvents()
			]);

			// A newer refresh overtook this one while it was in flight; its data is fresher.
			if (seq !== this.eventsSeq) return;
			this.lastError = null;

			this.ongoing = ongoingRows.map((row) => toKioskEvent(row));

			let candidates = ongoingRows;
			if (dev.bypass && candidates.length === 0 && upcomingRows.length > 0) {
				// Same fallback the web app uses: with no live event, borrow the next one so the
				// scan screen can be exercised outside event hours.
				candidates = [upcomingRows[0]];
			}

			const chosen = this.pickActive(candidates);
			if (chosen) {
				// Keep the existing count while the fresh one loads, so the number doesn't
				// flash to zero on every poll.
				const previous = this.activeEvent?.event_id === chosen.event_id
					? this.activeEvent.checked_in
					: 0;
				this.activeEvent = toKioskEvent(chosen, previous);
				void this.refreshCount();
			} else {
				this.activeEvent = null;
			}

			this.nextEvent = upcomingRows.length ? toKioskEvent(upcomingRows[0]) : null;
		} catch (e) {
			if (seq !== this.eventsSeq) return;
			this.lastError = e instanceof Error ? e.message : 'Could not reach the server';
			console.error('[kiosk] refreshEvents failed', e);
		}
	}

	async refreshCount() {
		const event = this.activeEvent;
		if (!event) return;
		try {
			const count = await attendanceApi.getCheckedInCount(event.event_id);
			// Guard against the event having changed while the request was in flight.
			if (this.activeEvent?.event_id === event.event_id) {
				this.activeEvent.checked_in = count;
			}
		} catch (e) {
			console.error('[kiosk] refreshCount failed', e);
		}
	}

	/**
	 * Accept a scanned code. Returns immediately - the check-in itself is queued onto the
	 * scan chain so overlapping scans can't interleave.
	 */
	submit(code: string) {
		const trimmed = code.trim();
		if (!trimmed || !this.scanning) return;

		const windowMs = this.settings.debounceSeconds * 1000;
		// Drop entries that have aged out. They never blocked anything - the check below is
		// time-based - but on a device that runs for days the map would only ever grow.
		const cutoff = Date.now() - windowMs;
		for (const [seen, at] of this.recent) {
			if (at < cutoff) this.recent.delete(seen);
		}

		const last = this.recent.get(trimmed);
		// A debounced repeat stays silent on purpose: it is almost always the scanner firing
		// twice on one badge, and a reject tone there reads as "you are not checked in".
		if (last && Date.now() - last < windowMs) return;
		this.recent.set(trimmed, Date.now());

		// The immediate "I have you", before any network work - the one sound that has to
		// land instantly, because the scanner's own beep only means "I read a barcode".
		playAccepted();

		this.chain = this.chain.then(() => this.process(trimmed)).catch((e) => {
			// The chain must survive any single failure or every later scan would be dropped.
			console.error('[kiosk] scan chain error', e);
		});
	}

	/** One check-in, start to finish. Never throws. */
	private async process(code: string) {
		const at = new Date();
		const event = this.activeEvent;

		// The event can end between `submit()` accepting the scan and this running - the
		// poll is on a 60 s timer and the scan may have been waiting behind others. Bailing
		// out silently would be the worst possible answer: `submit()` has already played the
		// accept tick, so the person hears "got you" and then sees nothing at all, in a UI
		// whose whole contract is that silence means "not registered".
		if (!event) {
			playRejected();
			this.show({
				outcome: 'rejected',
				member_name: null,
				member_code: null,
				care_group: null,
				at,
				queued: false,
				reason: 'That event has just ended. Please see staff.'
			});
			return;
		}

		// Offline: persist and tell the operator it is saved but not yet synced.
		if (!this.connected) {
			const stored = offlineQueue.enqueue(code, event.event_id, at, event.event_name);
			this.queued = offlineQueue.size();
			if (stored) playQueued();
			else playError();
			this.show(
				stored
					? {
							outcome: 'success',
							member_name: null,
							member_code: code.toUpperCase(),
							care_group: null,
							at,
							queued: true,
							reason: null
						}
					: {
							outcome: 'rejected',
							member_name: null,
							member_code: null,
							care_group: null,
							at,
							queued: false,
							reason: 'Offline and the local queue is full. Please see staff.'
						}
			);
			return;
		}

		// Developer bypass mirrors the web app's: mock the response rather than write. A test
		// scan must never land in real attendance data.
		if (dev.bypass) {
			const result = this.toResult(
				{ success: true, message: 'Mock scan success', member_name: 'Test Member', care_group: 'Test Group' },
				code,
				at
			);
			playSuccess();
			this.show(result);
			return;
		}

		try {
			const rpc = await attendanceApi.scanMember(code, event.event_id, at);
			const result = this.toResult(rpc, code, at);
			if (result.outcome === 'success') playSuccess();
			else if (result.outcome === 'duplicate') playDuplicate();
			else playRejected();
			this.show(result);
			// Trust the server's count rather than incrementing locally.
			if (rpc.success) void this.refreshCount();
		} catch (e) {
			// The request never landed - treat it as offline and keep the scan rather than
			// losing it. This is the path that previously dropped people silently.
			const stored = offlineQueue.enqueue(code, event.event_id, at, event.event_name);
			this.queued = offlineQueue.size();
			console.error('[kiosk] scanMember failed, scan queued', e);
			if (stored) playQueued();
			else playError();
			this.show({
				outcome: stored ? 'success' : 'rejected',
				member_name: null,
				member_code: stored ? code.toUpperCase() : null,
				care_group: null,
				at,
				queued: stored,
				reason: stored ? null : 'Could not save this scan. Please see staff.'
			});
		}
	}

	/**
	 * Map the RPC response onto what the flood renders.
	 *
	 * The duplicate test is a substring match on the server's message, copied from the web
	 * app's scan page. It is fragile - reword the RPC's message and duplicates start showing
	 * as generic rejections - but it is the only signal the RPC gives, and changing the RPC
	 * is out of scope (PLAN.md: no schema changes).
	 */
	private toResult(rpc: ScanRpcResult, code: string, at: Date): ScanResult {
		if (rpc.success) {
			return {
				outcome: 'success',
				member_name: rpc.member_name ?? null,
				member_code: code.toUpperCase(),
				care_group: rpc.care_group ?? null,
				at,
				queued: false,
				reason: null
			};
		}

		const isDuplicate = rpc.message?.includes('Already') ?? false;
		if (isDuplicate) {
			return {
				outcome: 'duplicate',
				member_name: rpc.member_name ?? null,
				member_code: code.toUpperCase(),
				care_group: rpc.care_group ?? null,
				at,
				queued: false,
				reason: null
			};
		}

		return {
			outcome: 'rejected',
			member_name: null,
			member_code: null,
			care_group: null,
			at,
			queued: false,
			reason: rpc.message || "This code isn't registered for this event."
		};
	}

	private show(result: ScanResult) {
		if (this.resultTimer) clearTimeout(this.resultTimer);
		this.result = result;
		this.resultTimer = setTimeout(
			() => (this.result = null),
			this.shared.resultDuration * 1000
		);
	}

	dismissResult() {
		if (this.resultTimer) clearTimeout(this.resultTimer);
		this.result = null;
	}

	/**
	 * Adopt the OS's actual fullscreen/autostart state rather than the remembered intention.
	 * Someone can disable the autostart entry outside the app, and a window manager can refuse
	 * fullscreen; showing what the kiosk last wrote would be a claim it cannot back up.
	 */
	async syncShellState() {
		if (!this.shell) return;
		const state = await readShellState();
		this.settings.fullscreenLock = state.fullscreen;
		this.settings.startOnBoot = state.autostart;
	}

	/** Apply a fullscreen change to the window, then store what actually took effect. */
	async setFullscreenLock(on: boolean) {
		this.settings.fullscreenLock = on;
		await setFullscreen(on);
		if (this.shell) {
			const state = await readShellState();
			this.settings.fullscreenLock = state.fullscreen;
		}
	}

	/** Same for start-on-boot: write, then read back what the OS accepted. */
	async setStartOnBoot(on: boolean) {
		this.settings.startOnBoot = on;
		await setAutostart(on);
		if (this.shell) {
			const state = await readShellState();
			this.settings.startOnBoot = state.autostart;
		}
	}

	/**
	 * Which input is live. Stored as two booleans for history, but they are mutually exclusive
	 * in the UI - the web app treats camera and USB scanner as alternatives too.
	 */
	get inputMode(): 'usb' | 'camera' {
		return this.settings.camera ? 'camera' : 'usb';
	}

	/**
	 * Apply an operational change immediately and persist it.
	 *
	 * Separate from the draft/Save flow on purpose. Settings is for configuration, where
	 * reviewing before committing is right; this is for the controls staff flip mid-queue,
	 * where a draft would mean a scanner that does not change until someone finds Save.
	 * Nothing routed through here can lose a scan or change who scans are recorded as.
	 */
	applyOperational(patch: Partial<KioskSettings>) {
		this.settings = { ...this.settings, ...patch };
		if (patch.beepVolume !== undefined) setBeepVolume(this.settings.beepVolume);
		persistSettings(this.settings);
		// Keep an open draft in step, so opening Settings afterwards doesn't look dirty.
		if (this.draft) this.draft = { ...this.draft, ...patch };
	}

	/** Switch input. One or the other, as the web app does. */
	setInputMode(mode: 'usb' | 'camera') {
		this.applyOperational({ camera: mode === 'camera', usbScanner: mode === 'usb' });
	}

	/** Open the settings screen on a fresh copy of the saved settings. */
	openSettings() {
		this.draft = { ...this.settings };
		this.backArmed = false;
		this.screen = 'settings';
	}

	/** Commit the draft: store it, then apply the parts with live side effects. */
	saveDraft(): boolean {
		if (!this.draft) return false;

		// The two OS-backed flags keep their live values rather than the draft's copy, which
		// was taken when the screen opened and may be out of date by now.
		const next: KioskSettings = {
			...this.draft,
			fullscreenLock: this.settings.fullscreenLock,
			startOnBoot: this.settings.startOnBoot
		};
		const ok = persistSettings(next);
		this.settings = next;

		setBeepVolume(next.beepVolume);
		this.setTimeFormat(next.timeFormat);
		this.applyTheme();

		this.draft = { ...next };
		this.backArmed = false;
		return ok;
	}

	/** Throw the draft away and put back anything that was previewing live. */
	discardDraft() {
		this.draft = null;
		this.backArmed = false;
		// Repaint the stored theme, undoing any preview the screen was showing.
		this.applyTheme(this.settings.theme);
	}

	/**
	 * Back, with one guard. Returns true when the screen should actually close.
	 *
	 * With unsaved changes the first press does NOT leave - it arms, and the save bar says so.
	 * A second press leaves and discards. This is the compromise a kiosk needs: staff must be
	 * able to walk away from a half-edited screen without a modal, but not lose work to a
	 * single stray tap on a device at a door.
	 */
	requestBack(): boolean {
		if (this.dirty && !this.backArmed) {
			this.backArmed = true;
			return false;
		}
		this.discardDraft();
		this.screen = 'scan';
		return true;
	}

	/** Persist the clock format under the same localStorage key the web app uses. */
	setTimeFormat(format: '12h' | '24h') {
		this.settings.timeFormat = format;
		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem('time_format', format);
			} catch (e) {
				console.error('[kiosk] could not persist time_format', e);
			}
		}
	}

	/**
	 * Paint a theme onto the document.
	 *
	 * Takes the theme explicitly so the settings screen can *preview* a choice without
	 * writing it into `settings`. Previously the toggle set `settings.theme` directly to get
	 * the preview, which made `draft.theme` and `settings.theme` move together: `dirty` never
	 * became true, so the save bar never appeared and the theme could not be saved at all -
	 * it reverted on the next restart. Preview paints; only Save stores.
	 */
	applyTheme(theme: 'dark' | 'light' = this.settings.theme) {
		const isDark = theme === 'dark';
		document.documentElement.classList.toggle('dark', isDark);
		// The brand colour is only safe on the light ground - see applySharedSettings.
		applySharedSettings(this.shared, isDark);
	}

	/**
	 * Show a result card without a scan, so its readability can be judged at the real screen
	 * and distance. Writes nothing and touches no counters.
	 */
	previewResult(kind: 'success' | 'duplicate' | 'rejected' | 'queued') {
		const at = new Date();
		this.show({
			outcome: kind === 'queued' ? 'success' : kind,
			member_name: kind === 'rejected' ? null : 'Test Member',
			member_code: kind === 'rejected' ? null : 'PREVIEW-0001',
			care_group: kind === 'rejected' ? null : 'Test Group',
			at,
			queued: kind === 'queued',
			reason: kind === 'rejected' ? "This code isn't registered for this event." : null
		});
	}

	/**
	 * Leave developer mode and undo everything it was doing.
	 *
	 * Clearing the flags is not enough on its own, because each one leaves something behind:
	 * a preview card still counting down on screen, an event "borrowed" from the upcoming list
	 * by the bypass, and a queue that stopped flushing while the device pretended to be
	 * offline. Switching developer mode off has to put all of that back, or the kiosk keeps
	 * behaving like a test rig after the switch says it isn't one.
	 */
	exitDeveloperMode() {
		dev.lock();

		// "Preview a result" leaves a card on screen with its own timer.
		this.dismissResult();

		// The bypass may have borrowed an upcoming event so the scanner could run outside
		// event hours; re-resolve rather than wait up to a minute for the next poll.
		void this.refreshEvents();

		// Simulated offline suppressed flushing. The device is really connected, so catch up.
		if (this.connected) void this.flushQueue();
	}

	/**
	 * Turn the bypass on or off and re-resolve events immediately.
	 *
	 * Same reason as above in miniature: with the bypass on the active event may be one that
	 * has not started, and leaving it in place until the next poll means up to a minute of
	 * scanning into the wrong event with the flag already off.
	 */
	setBypass(on: boolean) {
		dev.setBypass(on);
		void this.refreshEvents();
	}

	/** Toggle simulated offline, flushing anything that queued up while it was on. */
	setForceOffline(on: boolean) {
		dev.setForceOffline(on);
		if (!on && this.connected && this.queued > 0) void this.flushQueue();
	}

	/**
	 * Sign this device out, and unbind it.
	 *
	 * Also clears the PIN: the PIN belongs to a pairing, so leaving it behind would mean a
	 * device signed in with somebody's account was still gated by a PIN set by a pairing that
	 * no longer applies. After this the device needs a new pairing code, or an account.
	 *
	 * The queue is deliberately NOT cleared. Unsent scans are attendance that happened; they
	 * are kept so they can still go out once the device is signed in again - throwing them
	 * away on sign-out would silently lose real check-ins.
	 */
	async signOutDevice() {
		this.stop();
		await signOut();
		await clearPin();

		this.identity = null;
		this.activeEvent = null;
		this.nextEvent = null;
		this.ongoing = [];
		this.draft = null;
		this.screen = 'scan';
		this.started = false;
	}

	/** Developer tool: drop the backlog without sending it. */
	discardQueue() {
		offlineQueue.clear();
		this.queued = 0;
	}

	/** The queued scans themselves, for "View queued scans" in Settings. */
	pendingScans() {
		return offlineQueue.list();
	}

	/** Send the offline backlog. Safe to call repeatedly; a no-op when nothing is pending. */
	async flushQueue() {
		if (offlineQueue.size() === 0) {
			this.queued = 0;
			return;
		}

		const report = await offlineQueue.flush((code, eventId, at) =>
			attendanceApi.scanMember(code, eventId, at)
		);
		this.queued = report.remaining;
		if (report.synced > 0) void this.refreshCount();
		console.info(
			`[kiosk] flush: ${report.synced} synced, ${report.refused} refused, ${report.remaining} left`
		);
	}
}

export const kiosk = new KioskRuntime();

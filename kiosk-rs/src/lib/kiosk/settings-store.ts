import type { KioskSettings } from './types';

/**
 * Persistence for the device's own settings.
 *
 * Until now these lived only in `$state`, so every one of them — kiosk name, beep volume,
 * debounce window, camera, pinned event — was lost on reload. `time_format` happened to
 * survive because it is written separately for web-app parity, and fullscreen/autostart
 * survive because they are registered with the OS, which hid the gap.
 *
 * Deliberately localStorage and not the keyring: these are preferences, not secrets, and the
 * keyring round-trips over IPC. The session is the only thing that needs protecting.
 */

const STORAGE_KEY = 'kiosk.settings';

/**
 * Settings that are NOT stored here, and why:
 *
 * - `fullscreenLock` / `startOnBoot` are registered with the operating system. The OS is the
 *   source of truth — `readShellState()` reads them back — and writing a second copy here is
 *   how the two drift apart and the screen starts claiming something it cannot back up.
 */
type StoredSettings = Omit<KioskSettings, 'fullscreenLock' | 'startOnBoot'>;

/**
 * Merge over defaults rather than replacing them.
 *
 * A device that saved settings on an older build must keep working when a new field is added:
 * the stored blob simply won't have it, and the default fills in. Same lesson as the offline
 * queue's optional `eventName`.
 */
export function loadSettings(defaults: KioskSettings): KioskSettings {
	if (typeof localStorage === 'undefined') return { ...defaults };

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...defaults };

		const parsed = JSON.parse(raw) as Partial<StoredSettings>;
		if (!parsed || typeof parsed !== 'object') return { ...defaults };

		return {
			...defaults,
			...parsed,
			// Never let a stored value override what the OS actually reports.
			fullscreenLock: defaults.fullscreenLock,
			startOnBoot: defaults.startOnBoot
		};
	} catch (e) {
		console.error('[settings-store] could not read saved settings', e);
		return { ...defaults };
	}
}

/** Returns false when the write failed, so the UI can say so instead of claiming success. */
export function saveSettings(settings: KioskSettings): boolean {
	if (typeof localStorage === 'undefined') return false;

	try {
		const { fullscreenLock: _fs, startOnBoot: _sb, ...stored } = settings;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
		return true;
	} catch (e) {
		console.error('[settings-store] could not save settings', e);
		return false;
	}
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from './settings-store';
import type { KioskSettings } from './types';

/**
 * Settings persistence failing is silent: nothing throws, the device just forgets its name
 * and volume on the next restart, which is exactly the bug this module was written to fix.
 */
const DEFAULTS: KioskSettings = {
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

let store: Map<string, string>;
let failWrite = false;

beforeEach(() => {
	store = new Map();
	failWrite = false;
	(globalThis as { localStorage?: unknown }).localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => {
			if (failWrite) throw new Error('QuotaExceededError');
			store.set(k, v);
		},
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear()
	};
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settings persistence', () => {
	it('returns the defaults when nothing has been saved', () => {
		expect(loadSettings(DEFAULTS)).toEqual(DEFAULTS);
	});

	it('round-trips a changed setting', () => {
		expect(saveSettings({ ...DEFAULTS, deviceName: 'Side Door', beepVolume: 20 })).toBe(true);

		const loaded = loadSettings(DEFAULTS);
		expect(loaded.deviceName).toBe('Side Door');
		expect(loaded.beepVolume).toBe(20);
	});

	it('persists the theme, so it survives a restart', () => {
		// The reported symptom was the theme resetting. Persistence was never the problem -
		// the settings screen was previewing it by writing straight into the stored object, so
		// the draft never looked dirty and Save never appeared. This pins the storage half.
		expect(saveSettings({ ...DEFAULTS, theme: 'light' })).toBe(true);
		expect(loadSettings(DEFAULTS).theme).toBe('light');

		expect(saveSettings({ ...DEFAULTS, theme: 'dark' })).toBe(true);
		expect(loadSettings(DEFAULTS).theme).toBe('dark');
	});

	it('never persists the two settings the OS owns', () => {
		saveSettings({ ...DEFAULTS, fullscreenLock: false, startOnBoot: false });

		const raw = JSON.parse(store.get('kiosk.settings') as string);
		expect(raw).not.toHaveProperty('fullscreenLock');
		expect(raw).not.toHaveProperty('startOnBoot');
	});

	it('lets the live OS state win over anything stored for those two', () => {
		// An older build may have written them; they must not override what the OS reports.
		store.set(
			'kiosk.settings',
			JSON.stringify({ deviceName: 'Side Door', fullscreenLock: false, startOnBoot: false })
		);

		const loaded = loadSettings({ ...DEFAULTS, fullscreenLock: true, startOnBoot: true });
		expect(loaded.deviceName).toBe('Side Door');
		expect(loaded.fullscreenLock).toBe(true);
		expect(loaded.startOnBoot).toBe(true);
	});

	it('fills in fields a previously-saved blob does not have', () => {
		// Upgrade path: a device that saved before a setting existed must still boot, with the
		// new field taking its default rather than becoming undefined.
		store.set('kiosk.settings', JSON.stringify({ deviceName: 'Side Door' }));

		const loaded = loadSettings(DEFAULTS);
		expect(loaded.deviceName).toBe('Side Door');
		expect(loaded.beepVolume).toBe(70);
		expect(loaded.timeFormat).toBe('24h');
		expect(loaded.pinnedEventId).toBeNull();
	});

	it('falls back to defaults on corrupt storage rather than crashing the boot', () => {
		store.set('kiosk.settings', 'not json');
		expect(loadSettings(DEFAULTS)).toEqual(DEFAULTS);

		store.set('kiosk.settings', 'null');
		expect(loadSettings(DEFAULTS)).toEqual(DEFAULTS);
	});

	it('reports a failed write instead of claiming success', () => {
		failWrite = true;
		expect(saveSettings(DEFAULTS)).toBe(false);
	});
});

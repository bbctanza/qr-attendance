import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface KioskState {
	enabled: boolean;
}

const STORAGE_KEY = 'kiosk_mode';
const initialState: KioskState = { enabled: false };

/**
 * Kiosk mode - persisted so a dedicated check-in laptop comes back up the way it was left.
 *
 * Deliberately `localStorage`, not a server-side flag: this describes what ONE physical
 * device should do on boot, not an account-level or org-level preference. Two laptops
 * signed into the same account should be free to differ (one a kiosk, one an admin's own
 * machine), which a single shared setting could not express.
 *
 * Turning it off is gated by elevation (see the exit control on /scan) - this store itself
 * holds no such gate, since a store cannot block its own caller. Enabling it from App
 * Settings carries the same elevation requirement, enforced at the call site there.
 */
function createKioskStore() {
	const { subscribe, set } = writable<KioskState>(initialState);

	return {
		subscribe,
		init: () => {
			if (!browser) return;
			try {
				const saved = localStorage.getItem(STORAGE_KEY);
				if (saved) {
					set({ ...initialState, ...JSON.parse(saved) });
					return;
				}
			} catch {
				// Corrupt value - fall through to the default rather than crash the boot sequence.
			}
			set(initialState);
		},
		setEnabled: (enabled: boolean) => {
			if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled }));
			set({ enabled });
		}
	};
}

export const kioskMode = createKioskStore();

import { writable, derived, get } from 'svelte/store';
import { supabase } from '$lib/supabase';

/**
 * Elevation ("sudo mode") held for the current tab.
 *
 * Managing access used to re-prompt for the administrator's password on every individual
 * action, and each prompt was verified server-side with signInWithPassword - so changing
 * four people's roles meant typing the password four times and leaving four live refresh
 * tokens behind on the account.
 *
 * Instead the password is exchanged once for a short-lived, server-signed token that
 * authorises any number of privileged actions until it expires.
 *
 * Deliberately in memory only. Persisting it to localStorage or sessionStorage would make
 * elevation survive a tab close and put a bearer credential somewhere any script on the
 * page can read it; re-typing a password after a reload is the correct cost.
 */

export interface ElevationState {
	token: string | null;
	/** Epoch ms. */
	expiresAt: number;
}

const EMPTY: ElevationState = { token: null, expiresAt: 0 };

/** Below this, treat the token as already gone rather than start an action that will fail mid-flight. */
const EXPIRY_GRACE_MS = 5_000;

function createElevationStore() {
	const store = writable<ElevationState>(EMPTY);
	/** Drives the countdown in the UI; only runs while elevation is actually held. */
	const now = writable(Date.now());
	let ticker: ReturnType<typeof setInterval> | null = null;

	function stopTicker() {
		if (ticker) {
			clearInterval(ticker);
			ticker = null;
		}
	}

	function startTicker() {
		if (ticker) return;
		ticker = setInterval(() => {
			now.set(Date.now());
			const state = get(store);
			if (state.token && state.expiresAt <= Date.now()) {
				store.set(EMPTY);
				stopTicker();
			}
		}, 1000);
	}

	return {
		subscribe: store.subscribe,
		now: { subscribe: now.subscribe },

		grant(token: string, expiresAt: number) {
			store.set({ token, expiresAt });
			now.set(Date.now());
			startTicker();
		},

		clear() {
			store.set(EMPTY);
			stopTicker();
		},

		/** The token if it is still comfortably valid, otherwise null. */
		current(): string | null {
			const state = get(store);
			if (!state.token) return null;
			if (state.expiresAt - EXPIRY_GRACE_MS <= Date.now()) {
				store.set(EMPTY);
				stopTicker();
				return null;
			}
			return state.token;
		}
	};
}

export const elevation = createElevationStore();

/** True while a privileged action can run without prompting. */
export const isElevated = derived(
	[elevation, elevation.now],
	([$elevation, $now]) => !!$elevation.token && $elevation.expiresAt - EXPIRY_GRACE_MS > $now
);

/** Remaining time as `m:ss`, for the status pill. */
export const elevationRemaining = derived([elevation, elevation.now], ([$elevation, $now]) => {
	if (!$elevation.token) return '';
	const ms = Math.max(0, $elevation.expiresAt - $now);
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

// Elevation belongs to one signed-in identity. Signing out, or any token refresh that
// changes who is signed in, must drop it rather than let it carry over.
supabase.auth.onAuthStateChange((event) => {
	if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
		elevation.clear();
	}
});

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

/**
 * Lets any caller await the confirmation dialog instead of threading dialog state and a
 * "what was I about to do" callback through the page:
 *
 *   if (!(await ensureElevated())) return;
 *   await accessApi.updateRole(id, 'staff');
 *
 * A single `<ElevationDialog />` mounted on the page answers the request.
 */
export const elevationPromptOpen = writable(false);

let pending: ((granted: boolean) => void) | null = null;

/** Resolves true once elevation is held, false if the admin cancels. */
export function requestElevation(): Promise<boolean> {
	if (elevation.current()) return Promise.resolve(true);

	// A second request while the dialog is already up joins the first rather than
	// replacing it, so the earlier caller is never left waiting on a promise nobody settles.
	const previous = pending;
	return new Promise<boolean>((resolve) => {
		pending = (granted) => {
			previous?.(granted);
			resolve(granted);
		};
		elevationPromptOpen.set(true);
	});
}

/** Called by the dialog when it closes. */
export function settleElevationPrompt(granted: boolean) {
	elevationPromptOpen.set(false);
	const resolve = pending;
	pending = null;
	resolve?.(granted);
}

/** Held elevation, or a prompt for it. */
export async function ensureElevated(): Promise<boolean> {
	return elevation.current() ? true : requestElevation();
}

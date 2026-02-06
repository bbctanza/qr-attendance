import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { ChangelogEntry } from '$lib/config/changelog';

export interface ChangelogState {
	isOpen: boolean;
	currentEntry: ChangelogEntry | null;
}

const initialState: ChangelogState = {
	isOpen: false,
	currentEntry: null
};

function createChangelogStore() {
	const { subscribe, set } = writable<ChangelogState>(initialState);

	return {
		subscribe,
		showChangelog: (entry: ChangelogEntry) => {
			set({
				isOpen: true,
				currentEntry: entry
			});
		},
		closeChangelog: () => {
			set({
				isOpen: false,
				currentEntry: null
			});
		},
		checkAndShowChangelog: (currentVersion: string) => {
			if (!browser) return;

			const lastSeen = localStorage.getItem('lastSeenVersion');
			
			// Parse versions for comparison (e.g., "1.1.0" -> [1, 1, 0])
			const parseVersion = (v: string) => v.split('.').map(Number);
			const current = parseVersion(currentVersion);
			const last = lastSeen ? parseVersion(lastSeen) : [0, 0, 0];

			// Check if current version is greater than last seen
			for (let i = 0; i < 3; i++) {
				if (current[i] > (last[i] || 0)) {
					return true; // Should show changelog
				}
				if (current[i] < (last[i] || 0)) {
					return false; // Downgrade scenario (unlikely)
				}
			}
			return false; // Same version
		}
	};
}

export const changelogStore = createChangelogStore();

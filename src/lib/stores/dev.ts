import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface DevState {
	isMockTimeActive: boolean;
	mockTime: Date | null;
	// Audit Trail Settings
	auditTrailEnabled: boolean;
	gdprModeEnabled: boolean;
	restrictUndoToAdmin: boolean;
	requireUndoApproval: boolean;
	auditLogRetentionDays: number;
	auditBatchingEnabled: boolean;
}

const initialState: DevState = {
	isMockTimeActive: false,
	mockTime: null,
	// Audit Trail enabled by default, GDPR disabled, staff can undo
	auditTrailEnabled: true,
	gdprModeEnabled: false,
	restrictUndoToAdmin: false,
	requireUndoApproval: false,
	auditLogRetentionDays: 90,
	auditBatchingEnabled: true
};

function createDevStore() {
	const { subscribe, set, update } = writable<DevState>(initialState);

	return {
		subscribe,
		init: () => {
			if (!browser) return;
			const savedState = localStorage.getItem('dev_audit_settings');
			if (savedState) {
				try {
					const parsedState = JSON.parse(savedState);
					set({
						...initialState,
						...parsedState
					});
				} catch (e) {
					set(initialState);
				}
			} else {
				set(initialState);
			}
		},
		setMockTime: (date: Date) => {
			if (!browser) return;
			localStorage.setItem('dev_mock_time', date.toISOString());
			set({
				...initialState,
				isMockTimeActive: true,
				mockTime: date
			});
		},
		clearMockTime: () => {
			if (!browser) return;
			localStorage.removeItem('dev_mock_time');
			update((state) => ({
				...state,
				isMockTimeActive: false,
				mockTime: null
			}));
		},
		// Audit Trail Settings
		setAuditTrailEnabled: (enabled: boolean) => {
			update((state) => {
				const newState = { ...state, auditTrailEnabled: enabled };
				if (browser) localStorage.setItem('dev_audit_settings', JSON.stringify(newState));
				return newState;
			});
		},
		setGDPRModeEnabled: (enabled: boolean) => {
			update((state) => {
				const newState = { ...state, gdprModeEnabled: enabled };
				if (browser) localStorage.setItem('dev_audit_settings', JSON.stringify(newState));
				return newState;
			});
		},
		setRestrictUndoToAdmin: (restricted: boolean) => {
			update((state) => {
				const newState = { ...state, restrictUndoToAdmin: restricted };
				if (browser) localStorage.setItem('dev_audit_settings', JSON.stringify(newState));
				return newState;
			});
		},
		setRequireUndoApproval: (required: boolean) => {
			update((state) => {
				const newState = { ...state, requireUndoApproval: required };
				if (browser) localStorage.setItem('dev_audit_settings', JSON.stringify(newState));
				return newState;
			});
		},
		setAuditLogRetentionDays: (days: number) => {
			update((state) => {
				const newState = { ...state, auditLogRetentionDays: days };
				if (browser) localStorage.setItem('dev_audit_settings', JSON.stringify(newState));
				return newState;
			});
		},
		setAuditBatchingEnabled: (enabled: boolean) => {
			update((state) => {
				const newState = { ...state, auditBatchingEnabled: enabled };
				if (browser) localStorage.setItem('dev_audit_settings', JSON.stringify(newState));
				return newState;
			});
		},
		resetAuditSettings: () => {
			if (!browser) return;
			localStorage.removeItem('dev_audit_settings');
			set({
				...initialState,
				isMockTimeActive: false,
				mockTime: null
			});
		}
	};
}

export const devTools = createDevStore();

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface DevState {
	bypassEventTimeValidation: boolean;
	// Audit Trail Settings
	auditTrailEnabled: boolean;
	gdprModeEnabled: boolean;
	restrictUndoToAdmin: boolean;
	requireUndoApproval: boolean;
	auditLogRetentionDays: number;
	auditBatchingEnabled: boolean;
}

const initialState: DevState = {
	bypassEventTimeValidation: false,
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
			let state = { ...initialState };

			const savedState = localStorage.getItem('dev_audit_settings');
			if (savedState) {
				try {
					const parsedState = JSON.parse(savedState);
					state = { ...state, ...parsedState };
				} catch (e) {}
			}

			const savedBypass = localStorage.getItem('dev_bypass_time');
			if (savedBypass) {
				try {
					state.bypassEventTimeValidation = JSON.parse(savedBypass);
				} catch (e) {}
			}

			set(state);
		},
		setBypassEventTimeValidation: (enabled: boolean) => {
			if (!browser) return;
			localStorage.setItem('dev_bypass_time', JSON.stringify(enabled));
			update((state) => ({
				...state,
				bypassEventTimeValidation: enabled
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
				bypassEventTimeValidation: false
			});
		}
	};
}

export const devTools = createDevStore();

import type { ScanResult } from './types';

/**
 * Stand-in for the Supabase scan RPCs, so every result state is reachable before the
 * backend is wired up on Day 2.
 *
 * NOTE: no longer used - state.svelte.ts calls the real RPCs as of Day 2. Kept so the UI can
 * be demoed without a database; delete it once that stops being useful.
 *
 * Superseded by `scan_member_transaction` / `check_already_scanned` from the web app's
 * src/lib/api/attendance.ts. The shape returned here is what the UI consumes, so the
 * replacement only has to map the RPC response onto `ScanResult`.
 *
 * Demo codes: anything ending in 1-7 checks in, 8 is a duplicate, 9 or 0 is rejected.
 */

const NAMES = [
	'Juan Dela Cruz',
	'Maria Santos',
	'Jose Rizal',
	'Andres Bonifacio',
	'Gabriela Silang',
	'Apolinario Mabini',
	'Melchora Aquino'
];

export function resolveScan(code: string): Omit<ScanResult, 'queued'> {
	const last = code.slice(-1);
	const digit = Number.parseInt(last, 10);
	const index = Number.isNaN(digit) ? code.length % NAMES.length : digit % NAMES.length;
	const name = NAMES[index];
	const display = code.length > 12 ? `${code.slice(0, 12)}…` : code.toUpperCase();

	if (last === '8') {
		return {
			outcome: 'duplicate',
			member_name: name,
			member_code: display,
			care_group: null,
			at: new Date(Date.now() - 30 * 60_000),
			reason: null
		};
	}

	if (last === '9' || last === '0') {
		return {
			outcome: 'rejected',
			member_name: null,
			member_code: null,
			care_group: null,
			at: new Date(),
			reason: "This code isn't registered for this event."
		};
	}

	return {
		outcome: 'success',
		member_name: name,
		member_code: display,
		care_group: null,
		at: new Date(),
		reason: null
	};
}

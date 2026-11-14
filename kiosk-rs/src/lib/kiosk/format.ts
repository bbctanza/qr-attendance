export function formatClock(date: Date, format: '12h' | '24h', withSeconds = false): string {
	return date.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		...(withSeconds ? { second: '2-digit' } : {}),
		hour12: format === '12h'
	});
}

export function formatDay(date: Date): string {
	return date.toLocaleDateString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}

export interface Countdown {
	hours: number;
	minutes: number;
	seconds: number;
	totalMs: number;
}

/** Null once the target has passed - the caller distinguishes "overdue" from "no event". */
export function countdownTo(target: Date, from: Date): Countdown | null {
	const ms = target.getTime() - from.getTime();
	if (ms <= 0) return null;
	return {
		hours: Math.floor(ms / 3600_000),
		minutes: Math.floor((ms % 3600_000) / 60_000),
		seconds: Math.floor((ms % 60_000) / 1000),
		totalMs: ms
	};
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Event start watch
// ---------------------------------------------------------------------------

/**
 * How close to the start time the poll tightens up, and how fast it goes there.
 *
 * The regular event poll runs once a minute, which is fine for noticing that somebody
 * scheduled something but far too slow for the one moment that matters: the screen could sit
 * on "Starting now" for a full minute after an event had actually begun, and the handoff into
 * scanning would then play at an arbitrary time rather than on the beat.
 */
const IMMINENT_MS = 60_000;
const IMMINENT_INTERVAL_MS = 5_000;

export type PollAction = 'none' | 'refresh';

/**
 * Whether the next event's start time warrants refreshing right now.
 *
 * Pure on purpose - the runtime holds the state and this only decides, so the rule can be
 * tested without a Supabase client or a live clock.
 *
 * Two reasons to say yes:
 *  - the start time has just passed and this event has not been fired for yet, which is the
 *    moment the screen should change;
 *  - the start is inside the final minute, where a 5s cadence costs four extra reads and
 *    removes the window in which a status flip could go unnoticed.
 *
 * `firedForStart` is compared against `startIso` rather than an event id, so an admin moving
 * an event's start time re-arms the watch instead of it staying spent.
 */
export function startWatchAction(
	startIso: string | null,
	now: number,
	lastRefreshAt: number,
	firedForStart: string | null
): PollAction {
	if (!startIso) return 'none';

	const start = new Date(startIso).getTime();
	// Explicit rather than load-bearing: every comparison below is already false against NaN,
	// so a bad date falls through to 'none' on its own. Stated here so a later rewrite that
	// uses Math.min, a clamp, or an inverted test does not quietly turn it into 'refresh'.
	if (Number.isNaN(start)) return 'none';

	const remaining = start - now;

	if (remaining <= 0) {
		return firedForStart === startIso ? 'none' : 'refresh';
	}

	if (remaining <= IMMINENT_MS) {
		return now - lastRefreshAt >= IMMINENT_INTERVAL_MS ? 'refresh' : 'none';
	}

	return 'none';
}

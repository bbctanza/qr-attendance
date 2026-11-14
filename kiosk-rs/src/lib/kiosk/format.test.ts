import { describe, expect, it } from 'vitest';
import { startWatchAction } from './format';

/**
 * The rule that decides when the kiosk stops waiting for its once-a-minute poll.
 *
 * Worth testing on its own because both of its failure modes are invisible on screen: too
 * eager and the device hammers the API every second for the whole minute before an event;
 * too shy and the handoff into scanning plays up to a minute after the event really started,
 * which is the bug this was written to fix.
 */

const START = '2026-11-14T09:00:00.000Z';
const AT = (iso: string) => new Date(iso).getTime();

describe('startWatchAction', () => {
	it('does nothing when no event is scheduled', () => {
		expect(startWatchAction(null, AT(START), 0, null)).toBe('none');
	});

	it('does nothing while the start is still far off', () => {
		// Two minutes out: outside the final minute, so the regular 60s poll owns this.
		expect(startWatchAction(START, AT('2026-11-14T08:58:00.000Z'), 0, null)).toBe('none');
	});

	it('refreshes the moment the start time passes', () => {
		expect(startWatchAction(START, AT('2026-11-14T09:00:00.000Z'), 0, null)).toBe('refresh');
		expect(startWatchAction(START, AT('2026-11-14T09:00:01.000Z'), 0, null)).toBe('refresh');
	});

	it('fires only once for the same start time', () => {
		const now = AT('2026-11-14T09:00:05.000Z');
		// Already fired for this start: the 60s poll takes over rather than this running
		// every single tick until the server catches up.
		expect(startWatchAction(START, now, now, START)).toBe('none');
	});

	it('re-arms when the event is rescheduled', () => {
		const moved = '2026-11-14T09:30:00.000Z';
		const now = AT('2026-11-14T09:30:00.000Z');
		// Fired for the old start, but this is a different time - it must fire again.
		expect(startWatchAction(moved, now, now, START)).toBe('refresh');
	});

	it('polls faster inside the final minute, but not every tick', () => {
		const now = AT('2026-11-14T08:59:30.000Z');

		// 5s since the last read: due.
		expect(startWatchAction(START, now, now - 5_000, null)).toBe('refresh');
		// 6s: also due.
		expect(startWatchAction(START, now, now - 6_000, null)).toBe('refresh');
		// 4s: not yet. Without this the tick would refresh once a second for a full minute.
		expect(startWatchAction(START, now, now - 4_000, null)).toBe('none');
	});

	it('treats the final-minute boundary as inside the window', () => {
		const now = AT('2026-11-14T08:59:00.000Z');
		expect(startWatchAction(START, now, now - 10_000, null)).toBe('refresh');
		// A millisecond earlier is outside it.
		expect(startWatchAction(START, now - 1, now - 10_000, null)).toBe('none');
	});

	it('ignores an unparseable start time', () => {
		// Passes with or without the explicit guard, because NaN compares false both ways.
		// Kept to pin the behaviour itself, so a restructured implementation cannot lose it.
		expect(startWatchAction('not a date', AT(START), 0, null)).toBe('none');
	});
});

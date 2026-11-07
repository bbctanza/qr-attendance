import { describe, it, expect } from 'vitest';
import {
	circularMeanTime,
	formatClockTime,
	groupParticipation,
	hourHistogram,
	type GroupAttendanceRow,
	type MinuteBucket
} from './statistics';

/** A minute-of-day bucket, as get_check_in_distribution() returns it. */
const at = (hour: number, minute = 0, count = 1): MinuteBucket => ({ hour, minute, count });

describe('circularMeanTime', () => {
	it('averages across midnight instead of landing on noon', () => {
		// The regression: a plain mean of 1430 and 10 minutes gives 720 - the furthest
		// possible point from both samples.
		expect(circularMeanTime([at(23, 50), at(0, 10)])).toEqual({ hour: 0, minute: 0 });
	});

	it('averages a normal morning spread', () => {
		expect(circularMeanTime([at(7), at(8), at(9)])).toEqual({ hour: 8, minute: 0 });
	});

	it('weights each bucket by its count', () => {
		// Ten check-ins at 07:00 against one at 09:00 must sit close to 07:00.
		const mean = circularMeanTime([at(7, 0, 10), at(9, 0, 1)]);
		expect(mean?.hour).toBe(7);
		expect(mean?.minute).toBeLessThan(15);
	});

	it('returns the single sample unchanged', () => {
		expect(circularMeanTime([at(7, 35)])).toEqual({ hour: 7, minute: 35 });
	});

	it('returns null for no samples', () => {
		expect(circularMeanTime([])).toBeNull();
	});

	it('ignores empty buckets', () => {
		expect(circularMeanTime([at(7, 0, 0)])).toBeNull();
	});

	it('returns null when samples cancel out, rather than an arbitrary answer', () => {
		// 06:00 and 18:00 are antipodal: no mean time of day is meaningful.
		expect(circularMeanTime([at(6), at(18)])).toBeNull();
	});
});

describe('formatClockTime', () => {
	it('formats 24-hour with padding', () => {
		expect(formatClockTime({ hour: 7, minute: 5 }, false)).toBe('07:05');
	});

	it('formats 12-hour with a period', () => {
		expect(formatClockTime({ hour: 7, minute: 5 }, true)).toBe('7:05 AM');
		expect(formatClockTime({ hour: 19, minute: 5 }, true)).toBe('7:05 PM');
	});

	it('renders midnight and noon correctly in 12-hour', () => {
		expect(formatClockTime({ hour: 0, minute: 0 }, true)).toBe('12:00 AM');
		expect(formatClockTime({ hour: 12, minute: 0 }, true)).toBe('12:00 PM');
	});

	it('shows a placeholder when there is no mean', () => {
		expect(formatClockTime(null, true)).toBe('--:--');
	});
});

describe('hourHistogram', () => {
	it('sums buckets into their hour and omits empty hours', () => {
		expect(hourHistogram([at(7, 10), at(7, 50), at(9, 0)])).toEqual([
			{ hour: 7, count: 2, label: '7 AM' },
			{ hour: 9, count: 1, label: '9 AM' }
		]);
	});

	it('respects bucket counts rather than counting rows', () => {
		expect(hourHistogram([at(7, 10, 12), at(7, 40, 3)])).toEqual([
			{ hour: 7, count: 15, label: '7 AM' }
		]);
	});

	it('labels afternoon hours as PM and midnight as 12 AM', () => {
		expect(hourHistogram([at(0, 5), at(13, 0)]).map((b) => b.label)).toEqual(['12 AM', '1 PM']);
	});

	it('returns nothing for no check-ins', () => {
		expect(hourHistogram([])).toEqual([]);
	});
});

describe('groupParticipation', () => {
	const row = (over: Partial<GroupAttendanceRow> & { group_name: string }): GroupAttendanceRow => ({
		group_id: 1,
		member_count: 10,
		present_count: 0,
		event_count: 1,
		...over
	});

	it('rates a single event as present over members', () => {
		const [g] = groupParticipation([
			row({ group_name: 'Youth', member_count: 14, present_count: 12 })
		]);
		expect(g.rate).toBe(86);
		expect(g.present).toBe(12);
		expect(g.members).toBe(14);
	});

	it('divides by members x events over a multi-event window', () => {
		// Four Sundays, ten members, everyone every week: 40 attendances is 100%, not 400%.
		const [g] = groupParticipation([
			row({ group_name: 'Choir', member_count: 10, present_count: 40, event_count: 4 })
		]);
		expect(g.rate).toBe(100);
	});

	it('reports half attendance over a window as 50%', () => {
		const [g] = groupParticipation([
			row({ group_name: 'Choir', member_count: 10, present_count: 20, event_count: 4 })
		]);
		expect(g.rate).toBe(50);
	});

	it('does not divide by zero for an empty group', () => {
		const [g] = groupParticipation([
			row({ group_name: 'Empty', member_count: 0, present_count: 0 })
		]);
		expect(g.rate).toBe(0);
		expect(Number.isNaN(g.rate)).toBe(false);
	});

	it('does not divide by zero when no events are in scope', () => {
		const [g] = groupParticipation([
			row({ group_name: 'Youth', member_count: 10, present_count: 0, event_count: 0 })
		]);
		expect(g.rate).toBe(0);
	});

	it('sorts lowest rate first so the lagging group reads at the top', () => {
		const rows = [
			row({ group_id: 1, group_name: 'Youth', member_count: 10, present_count: 9 }),
			row({ group_id: 2, group_name: 'Care-2', member_count: 10, present_count: 1 }),
			row({ group_id: 3, group_name: 'Care-1', member_count: 10, present_count: 5 })
		];
		expect(groupParticipation(rows).map((g) => g.name)).toEqual(['Care-2', 'Care-1', 'Youth']);
	});

	it('gives the ungrouped bucket a stable id', () => {
		const [g] = groupParticipation([
			row({ group_id: null, group_name: 'No group', member_count: 3, present_count: 1 })
		]);
		expect(g.id).toBe('ungrouped');
	});
});

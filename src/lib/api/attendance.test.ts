import { describe, it, expect } from 'vitest';
import { summariseAttendance, type AttendanceSummaryRow } from './attendance';

function row(
	overrides: Partial<AttendanceSummaryRow> & Pick<AttendanceSummaryRow, 'event_id'>
): AttendanceSummaryRow {
	return {
		event_name: `Event ${overrides.event_id}`,
		event_date: '2026-11-01',
		start_datetime: '2026-11-01T09:00:00',
		end_datetime: '2026-11-01T11:00:00',
		records_absents: true,
		present_count: 0,
		absent_count: 0,
		...overrides
	};
}

describe('summariseAttendance', () => {
	it('rates a month of absence-tracking events against their own expected totals', () => {
		const totals = summariseAttendance([
			row({ event_id: 1, present_count: 40, absent_count: 60 }),
			row({ event_id: 2, present_count: 60, absent_count: 40 })
		]);

		expect(totals.trackedPresent).toBe(100);
		expect(totals.trackedExpected).toBe(200);
		expect(totals.attendanceRate).toBe(50);
		expect(totals.untracked).toHaveLength(0);
	});

	it('keeps headcount-only events out of the rate', () => {
		// The regression: present counted every event, expected counted only tracking ones.
		// 50 + 90 = 140 over an expected total of 100 reported 140%.
		const totals = summariseAttendance([
			row({ event_id: 1, present_count: 50, absent_count: 50, records_absents: true }),
			row({ event_id: 2, present_count: 90, absent_count: 0, records_absents: false })
		]);

		expect(totals.attendanceRate).toBe(50);
		expect(totals.attendanceRate).toBeLessThanOrEqual(100);
		expect(totals.trackedPresent).toBe(50);
		expect(totals.trackedExpected).toBe(100);
		expect(totals.untracked.map((r) => r.event_id)).toEqual([2]);
		// The 90 are still real people and still counted as attendance, just not as a rate.
		expect(totals.totalPresent).toBe(140);
	});

	it('never exceeds 100% for any mix of tracked and untracked events', () => {
		const totals = summariseAttendance([
			row({ event_id: 1, present_count: 1, absent_count: 99, records_absents: true }),
			row({ event_id: 2, present_count: 500, absent_count: 0, records_absents: false }),
			row({ event_id: 3, present_count: 800, absent_count: 0, records_absents: false })
		]);

		expect(totals.attendanceRate).toBe(1);
		expect(totals.attendanceRate).toBeLessThanOrEqual(100);
	});

	it('reports no rate rather than dividing by zero when nothing tracked absences', () => {
		const totals = summariseAttendance([
			row({ event_id: 1, present_count: 30, records_absents: false }),
			row({ event_id: 2, present_count: 20, records_absents: false })
		]);

		expect(totals.trackedExpected).toBe(0);
		expect(totals.attendanceRate).toBe(0);
		expect(totals.totalPresent).toBe(50);
		expect(totals.averageSize).toBe(25);
	});

	it('handles an empty month', () => {
		const totals = summariseAttendance([]);

		expect(totals.attendanceRate).toBe(0);
		expect(totals.averageSize).toBe(0);
		expect(totals.totalPresent).toBe(0);
	});

	it('averages attendance over every event, tracked or not', () => {
		const totals = summariseAttendance([
			row({ event_id: 1, present_count: 10, absent_count: 90 }),
			row({ event_id: 2, present_count: 20, records_absents: false })
		]);

		expect(totals.averageSize).toBe(15);
	});
});

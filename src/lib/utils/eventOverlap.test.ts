import { describe, it, expect } from 'vitest';
import { schedulesOverlap, findScheduleConflicts, weekRanges } from './eventOverlap';

const at = (day: number, start: string, end: string) => ({
	day_of_week: day,
	start_time: start,
	end_time: end
});

const SUN = 0;
const MON = 1;
const SAT = 6;

describe('schedulesOverlap', () => {
	it('catches a schedule nested inside another', () => {
		// The live case: Test Attendance sits entirely inside Sunday Morning Worship.
		expect(schedulesOverlap(at(SUN, '07:30', '11:00'), at(SUN, '08:30', '09:30'))).toBe(true);
	});

	it('treats a shared boundary as no overlap', () => {
		// Worship ends 11:00, Choir Practice starts 11:00 - back to back, legitimate.
		expect(schedulesOverlap(at(SUN, '07:30', '11:00'), at(SUN, '11:00', '16:00'))).toBe(false);
	});

	it('catches a partial overlap in either argument order', () => {
		const a = at(SUN, '09:00', '11:00');
		const b = at(SUN, '10:00', '12:00');
		expect(schedulesOverlap(a, b)).toBe(true);
		expect(schedulesOverlap(b, a)).toBe(true);
	});

	it('does not confuse the same hours on different days', () => {
		expect(schedulesOverlap(at(SUN, '09:00', '11:00'), at(MON, '09:00', '11:00'))).toBe(false);
	});

	it('carries an overnight schedule into the following day', () => {
		expect(schedulesOverlap(at(SUN, '23:30', '03:00'), at(MON, '02:00', '04:00'))).toBe(true);
		expect(schedulesOverlap(at(SUN, '23:30', '03:00'), at(MON, '04:00', '05:00'))).toBe(false);
	});

	it('wraps a Saturday night schedule round to Sunday', () => {
		expect(schedulesOverlap(at(SAT, '23:00', '02:00'), at(SUN, '01:00', '03:00'))).toBe(true);
		expect(schedulesOverlap(at(SAT, '23:00', '02:00'), at(SUN, '03:00', '04:00'))).toBe(false);
	});

	it('does not treat distant slots on one day as overlapping', () => {
		// 22 hours apart on the weekly clock, despite both being "Sunday".
		expect(schedulesOverlap(at(SUN, '23:30', '03:00'), at(SUN, '01:08', '09:00'))).toBe(false);
	});

	it('accepts HH:MM:SS as stored by Postgres TIME columns', () => {
		expect(schedulesOverlap(at(SUN, '07:30:00', '11:00:00'), at(SUN, '08:30:00', '09:30:00'))).toBe(
			true
		);
	});

	it('splits a week-end wrap into two ranges', () => {
		expect(weekRanges(at(SAT, '23:00', '02:00'))).toEqual([
			[10020, 10080],
			[0, 120]
		]);
	});
});

describe('findScheduleConflicts', () => {
	const worship = { ...at(SUN, '07:30', '11:00'), id: 1, name: 'Sunday Morning Worship Service' };
	const test = { ...at(SUN, '08:30', '09:30'), id: 2, name: 'Test Attendance' };
	const choir = { ...at(SUN, '11:00', '16:00'), id: 3, name: 'Church Choir Practice' };

	it('reports the collision from both sides', () => {
		const conflicts = findScheduleConflicts([worship, test, choir], (s) => s.id);

		expect(conflicts.get(1)?.map((c) => c.name)).toEqual(['Test Attendance']);
		expect(conflicts.get(2)?.map((c) => c.name)).toEqual(['Sunday Morning Worship Service']);
		// Choir only touches Worship at 11:00, so it is clean.
		expect(conflicts.has(3)).toBe(false);
	});

	it('ignores inactive schedules, which generate nothing', () => {
		const conflicts = findScheduleConflicts([worship, { ...test, is_active: false }], (s) => s.id);
		expect(conflicts.size).toBe(0);
	});

	it('returns nothing for a clean calendar', () => {
		expect(findScheduleConflicts([worship, choir], (s) => s.id).size).toBe(0);
	});
});

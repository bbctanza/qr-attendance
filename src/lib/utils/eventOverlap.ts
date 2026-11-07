/**
 * Weekly-clock overlap for recurring schedules.
 *
 * A direct port of event_type_week_ranges() from migration 010, so the warning the UI shows
 * and the rule the database enforces cannot disagree. Keep the two in step.
 *
 * A schedule occupies a span on a seven-day, 10080-minute clock. Working in those terms is
 * what makes an overnight schedule comparable to a daytime one: a Sunday 23:30-03:00 slot
 * genuinely occupies late Sunday AND early Monday, and a Saturday-night slot wraps round to
 * the start of the week.
 */

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = 10080;

export interface WeeklySchedule {
	/** 0 = Sunday ... 6 = Saturday */
	day_of_week: number;
	/** "HH:MM" or "HH:MM:SS" */
	start_time: string;
	end_time: string;
}

type Range = [start: number, end: number];

function toMinutes(time: string): number {
	const [h, m] = time.split(':');
	return Number(h) * 60 + Number(m);
}

/** One range, or two when the span wraps past the end of the week. */
export function weekRanges(schedule: WeeklySchedule): Range[] {
	const startMin = toMinutes(schedule.start_time);
	const endMin = toMinutes(schedule.end_time);

	const start = schedule.day_of_week * MINUTES_PER_DAY + startMin;
	// end <= start means the schedule runs past midnight into the next day.
	const end =
		schedule.day_of_week * MINUTES_PER_DAY + endMin + (endMin <= startMin ? MINUTES_PER_DAY : 0);

	const ranges: Range[] = [[start, Math.min(end, MINUTES_PER_WEEK)]];
	if (end > MINUTES_PER_WEEK) ranges.push([0, end - MINUTES_PER_WEEK]);

	return ranges.filter(([s, e]) => e > s);
}

/** Half-open, matching the database: one slot ending as another begins is not an overlap. */
export function schedulesOverlap(a: WeeklySchedule, b: WeeklySchedule): boolean {
	const ra = weekRanges(a);
	const rb = weekRanges(b);
	return ra.some(([as, ae]) => rb.some(([bs, be]) => as < be && ae > bs));
}

/**
 * For each schedule, the other schedules it collides with.
 *
 * Keyed by whatever `id` the caller supplies. Only active schedules are compared - an
 * inactive one generates nothing and so cannot collide with anything.
 */
export function findScheduleConflicts<T extends WeeklySchedule & { is_active?: boolean }>(
	schedules: T[],
	id: (schedule: T) => string | number
): Map<string | number, T[]> {
	const conflicts = new Map<string | number, T[]>();
	const active = schedules.filter((s) => s.is_active !== false);

	for (let i = 0; i < active.length; i++) {
		for (let j = i + 1; j < active.length; j++) {
			if (!schedulesOverlap(active[i], active[j])) continue;

			for (const [self, other] of [
				[active[i], active[j]],
				[active[j], active[i]]
			] as const) {
				const key = id(self);
				const list = conflicts.get(key) ?? [];
				list.push(other);
				conflicts.set(key, list);
			}
		}
	}

	return conflicts;
}

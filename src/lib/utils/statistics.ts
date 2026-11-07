/**
 * Pure statistics for the analytics page.
 *
 * Extracted from the page so the arithmetic can be tested directly, following the same
 * convention as summariseAttendance() and parseEventDate().
 *
 * These take minute-of-day buckets rather than timestamps. The database already groups and
 * localises them (get_check_in_distribution, migration 013), which keeps timezone conversion
 * in one place and means the browser receives a few dozen rows instead of thousands.
 */

/** One minute of the day that had check-ins, already in the viewer's timezone. */
export interface MinuteBucket {
	hour: number;
	minute: number;
	count: number;
}

export interface ClockTime {
	hour: number;
	minute: number;
}

/**
 * Mean time of day, computed on the circle rather than on a number line.
 *
 * A plain average of minutes-past-midnight is wrong whenever the samples straddle midnight:
 * 23:50 and 00:10 are twenty minutes apart, but averaging 1430 and 10 gives 720 - noon, the
 * furthest possible point from both. That is not hypothetical here, since services are
 * stored running from 23:30 to 03:00.
 *
 * Each bucket is a unit vector at its angle on the 24-hour clock, weighted by its count; the
 * mean of those vectors is converted back to an angle. Returns null for no samples, and also
 * when the samples are spread so evenly that the mean vector has no direction (exactly 06:00
 * and exactly 18:00, say), where no average time is meaningful.
 */
export function circularMeanTime(buckets: MinuteBucket[]): ClockTime | null {
	let x = 0;
	let y = 0;
	let n = 0;

	for (const bucket of buckets) {
		if (!Number.isFinite(bucket.count) || bucket.count <= 0) continue;
		const angle = ((bucket.hour * 60 + bucket.minute) / 1440) * 2 * Math.PI;
		x += Math.cos(angle) * bucket.count;
		y += Math.sin(angle) * bucket.count;
		n += bucket.count;
	}

	if (n === 0) return null;

	// Antipodal samples cancel out, leaving a vector with no meaningful direction.
	if (Math.sqrt(x * x + y * y) / n < 1e-9) return null;

	let angle = Math.atan2(y / n, x / n);
	if (angle < 0) angle += 2 * Math.PI;

	const totalMinutes = Math.round((angle / (2 * Math.PI)) * 1440) % 1440;
	return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
}

/** "7:05 AM" or "07:05", matching the app's time-format preference. */
export function formatClockTime(time: ClockTime | null, use12Hour: boolean): string {
	if (!time) return '--:--';
	const minute = String(time.minute).padStart(2, '0');
	if (!use12Hour) return `${String(time.hour).padStart(2, '0')}:${minute}`;
	const hour = time.hour % 12 || 12;
	return `${hour}:${minute} ${time.hour >= 12 ? 'PM' : 'AM'}`;
}

export interface HourBucket {
	hour: number;
	count: number;
	label: string;
}

/**
 * Check-ins per hour of the day.
 *
 * Only hours that actually have check-ins are returned: a congregation arriving between 7am
 * and 9am produces three bars, not twenty-four with twenty-one empty.
 */
export function hourHistogram(buckets: MinuteBucket[]): HourBucket[] {
	const counts = new Array<number>(24).fill(0);

	for (const bucket of buckets) {
		if (bucket.hour < 0 || bucket.hour > 23) continue;
		counts[bucket.hour] += bucket.count;
	}

	return counts
		.map((count, hour) => ({
			hour,
			count,
			label: `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`
		}))
		.filter((bucket) => bucket.count > 0);
}

export interface GroupAttendanceRow {
	group_id: number | null;
	group_name: string;
	member_count: number;
	/** Counts a member once per event attended, not once overall. */
	present_count: number;
	/** Completed events in the window. 1 when a single event is selected. */
	event_count: number;
}

export interface GroupParticipation {
	id: string;
	name: string;
	present: number;
	members: number;
	/** 0-100. Zero when the group has no members, rather than NaN. */
	rate: number;
}

/**
 * Each group's own participation rate, as a percentage of the attendance it could have had.
 *
 * Not the group's share of total attendance, which is what the page used to plot while
 * discarding the member count it had already fetched. A share makes a large group look best
 * by construction; a rate is comparable across group sizes.
 *
 * The denominator is members x events, not members. present_count counts a member once per
 * event they attended, so over a four-Sunday window a group where everyone came every week
 * has present_count = 4 x members. Dividing by members alone would report 400%.
 *
 * Sorted lowest first, so the group that needs attention reads at the top.
 */
export function groupParticipation(rows: GroupAttendanceRow[]): GroupParticipation[] {
	return rows
		.map((row) => {
			const opportunities = row.member_count * row.event_count;
			return {
				id: row.group_id === null ? 'ungrouped' : String(row.group_id),
				name: row.group_name,
				present: row.present_count,
				members: row.member_count,
				rate: opportunities > 0 ? Math.round((row.present_count / opportunities) * 100) : 0
			};
		})
		.sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
}

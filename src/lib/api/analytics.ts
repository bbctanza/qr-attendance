import { supabase } from '$lib/supabase';
import { attendanceApi, summariseAttendance, type AttendanceSummaryRow } from '$lib/api/attendance';
import type { GroupAttendanceRow, MinuteBucket } from '$lib/utils/statistics';

/**
 * Data for the analytics page.
 *
 * The headline rate deliberately goes through attendanceApi.getAttendanceSummary() and
 * summariseAttendance() rather than recomputing anything: analytics and the history page then
 * report the same number by construction, and `record_absents` is handled correctly for free.
 * The page previously built its own denominator as
 *
 *     completedEventCount x memberCount
 *
 * which ignored record_absents entirely and applied today's member count to historical
 * events - the same defect that let the history page print rates above 100%.
 */

/** Matches the error wrapper in attendance.ts, so a PostgREST failure keeps its own words. */
interface PostgrestLikeError {
	message?: string;
	details?: string | null;
	hint?: string | null;
	code?: string | null;
}

function asError(error: PostgrestLikeError, context: string): Error {
	const parts = [error.message?.trim() || 'the database rejected the request'];
	if (error.details) parts.push(String(error.details).trim());
	if (error.hint) parts.push(`Hint: ${String(error.hint).trim()}`);

	const wrapped = new Error(`${context}: ${parts.join(' — ')}`);
	wrapped.name = error.code ? `DatabaseError(${error.code})` : 'DatabaseError';
	Object.assign(wrapped, { code: error.code, details: error.details, hint: error.hint });
	console.error(`[analytics] ${context} failed`, error);
	return wrapped;
}

export const analyticsApi = {
	/** Completed events, newest first, for the event picker. */
	async getCompletedEvents() {
		const { data, error } = await supabase
			.from('events')
			.select('event_id, event_name, event_date, status')
			.eq('status', 'completed')
			.order('event_date', { ascending: false });

		if (error) throw asError(error, 'Loading the event list');
		return data ?? [];
	},

	/**
	 * Per-event headcounts for a window, or for one event.
	 *
	 * A single event is fetched by its own date range rather than a dedicated query, so both
	 * paths go through the same aggregate and cannot disagree.
	 */
	async getSummary(from: string, to: string): Promise<AttendanceSummaryRow[]> {
		return attendanceApi.getAttendanceSummary(from, to);
	},

	/** One row per group: roster size, attendances, and how many events were in scope. */
	async getGroupAttendance(
		from: string,
		to: string,
		eventId?: number
	): Promise<GroupAttendanceRow[]> {
		const { data, error } = await supabase.rpc('get_group_attendance_summary', {
			p_from: from,
			p_to: to,
			p_event_id: eventId ?? null
		});

		if (error) throw asError(error, `Loading group attendance for ${from} to ${to}`);
		return (data ?? []) as GroupAttendanceRow[];
	},

	/**
	 * Members on file right now.
	 *
	 * Reported as its own figure rather than folded into a rate. The page used to multiply it
	 * by the event count to invent an expected total, which applied today's roster to events
	 * that completed months ago; the real expected total comes from the recorded absences in
	 * get_attendance_summary().
	 */
	async getMemberCount(): Promise<number> {
		const { count, error } = await supabase
			.from('members')
			.select('*', { count: 'exact', head: true });

		if (error) throw asError(error, 'Counting members');
		return count ?? 0;
	},

	/**
	 * Check-ins grouped by minute of the day, already in the given timezone.
	 *
	 * An RPC rather than a table read, which is the whole point. Every other call on the
	 * analytics page goes through a SECURITY DEFINER aggregate; this one used to select raw
	 * scan_datetime rows, which put it on the RLS path - the same path measured at 26 seconds
	 * in migration 009 - and asked for up to 5000 rows so the browser could count them.
	 */
	async getCheckInDistribution(
		from: string,
		to: string,
		timeZone: string,
		eventId?: number
	): Promise<MinuteBucket[]> {
		const { data, error } = await supabase.rpc('get_check_in_distribution', {
			p_from: from,
			p_to: to,
			p_timezone: timeZone,
			p_event_id: eventId ?? null
		});

		if (error) throw asError(error, 'Loading check-in times');

		return (data ?? []).map((row: { hour: number; minute: number; check_ins: number }) => ({
			hour: row.hour,
			minute: row.minute,
			count: row.check_ins
		}));
	}
};

export { summariseAttendance };

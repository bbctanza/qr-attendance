import { supabase } from '$lib/supabase';
import type {
	AttendanceEvent,
	AttendanceScanWithMember,
	AttendancePresentWithMember,
	AttendanceHistoryWithEvent
} from '$lib/types';

/** One completed event with its headcounts, as returned by get_attendance_summary(). */
export interface AttendanceSummaryRow {
	event_id: number;
	event_name: string;
	event_date: string;
	start_datetime: string;
	end_datetime: string;
	/**
	 * Whether absentees were written for this event. When false there is no expected total,
	 * so the event contributes a headcount but cannot contribute to an attendance rate.
	 */
	records_absents: boolean;
	present_count: number;
	absent_count: number;
}

export type RosterKind = 'present' | 'absent';

/** A member on an event roster. `time` is null for absentees - they have no scan. */
export interface RosterEntry {
	member_id: string;
	first_name: string;
	last_name: string;
	care_group: string;
	scan_datetime: string | null;
}

export interface LiveStats {
	present: number;
	expected: number;
}

/** The shape supabase-js returns on a failed PostgREST call. */
interface PostgrestLikeError {
	message?: string;
	details?: string | null;
	hint?: string | null;
	code?: string | null;
}

/**
 * Turn a PostgREST error into a real Error that keeps the database's own words.
 *
 * supabase-js rejects with a plain object, not an Error. formatError() in $lib/utils then
 * classifies it by substring - and because PostgREST messages routinely contain the word
 * "fetch", a genuine SQL failure was being reported to the operator as "Unable to connect to
 * the server. Check your internet connection", which is both wrong and unactionable. The
 * message, code, details and hint are preserved here so the toast and the console say what
 * actually went wrong.
 */
function asError(error: PostgrestLikeError, context: string): Error {
	const parts = [error.message?.trim() || 'the database rejected the request'];
	if (error.details) parts.push(String(error.details).trim());
	if (error.hint) parts.push(`Hint: ${String(error.hint).trim()}`);

	const wrapped = new Error(`${context}: ${parts.join(' — ')}`);
	wrapped.name = error.code ? `DatabaseError(${error.code})` : 'DatabaseError';
	// The structured original, for anyone reading the console rather than the toast.
	Object.assign(wrapped, { code: error.code, details: error.details, hint: error.hint });
	console.error(`[attendance] ${context} failed`, error);
	return wrapped;
}

export interface AttendanceTotals {
	/** Events that recorded absentees, and so have an expected total. */
	tracked: AttendanceSummaryRow[];
	/** Events that recorded only a headcount. Excluded from the rate. */
	untracked: AttendanceSummaryRow[];
	trackedPresent: number;
	trackedExpected: number;
	/** 0-100, over `tracked` only. */
	attendanceRate: number;
	/** Everyone who attended, tracked or not - a headcount, not a rate input. */
	totalPresent: number;
	averageSize: number;
}

/**
 * Month totals, partitioned by whether the event recorded absences.
 *
 * Pure and exported so the arithmetic can be tested directly: the rate used to be able to
 * exceed 100% because the numerator summed every event in the month while the denominator
 * skipped events with record_absents off, so the two sides described different populations.
 * Both now come from `tracked`.
 */
export function summariseAttendance(rows: AttendanceSummaryRow[]): AttendanceTotals {
	const tracked = rows.filter((row) => row.records_absents);
	const untracked = rows.filter((row) => !row.records_absents);

	const trackedPresent = tracked.reduce((sum, row) => sum + row.present_count, 0);
	const trackedExpected = tracked.reduce(
		(sum, row) => sum + row.present_count + row.absent_count,
		0
	);
	const totalPresent = rows.reduce((sum, row) => sum + row.present_count, 0);

	return {
		tracked,
		untracked,
		trackedPresent,
		trackedExpected,
		attendanceRate: trackedExpected > 0 ? Math.round((trackedPresent / trackedExpected) * 100) : 0,
		totalPresent,
		averageSize: rows.length ? Math.round(totalPresent / rows.length) : 0
	};
}

export const attendanceApi = {
	/**
	 * Trigger a check to update statuses of all events.
	 * Can be called periodically by the client or lazily before fetching.
	 */
	async refreshEventStatuses(mockDate?: Date | null) {
		let payload = {};
		if (mockDate) {
			// Adjust to local time string to match naive TIMESTAMP in DB
			const offset = mockDate.getTimezoneOffset() * 60000;
			const localIso = new Date(mockDate.getTime() - offset).toISOString().slice(0, -1);
			payload = { p_now: localIso };
		}
		const { error } = await supabase.rpc('update_event_statuses', payload);
		if (error) console.error('Failed to refresh event statuses:', error);
	},

	/**
	 * Get all currently 'ongoing' events.
	 * Used by the scanner to determine if scanning is allowed.
	 */
	async getOngoingEvents() {
		// Optional: Lazily update statuses before fetching
		// await attendanceApi.refreshEventStatuses();

		const { data, error } = await supabase.from('events').select('*').eq('status', 'ongoing');

		if (error) throw error;
		return data as AttendanceEvent[];
	},

	/**
	 * Get upcoming events for display
	 */
	async getUpcomingEvents() {
		const { data, error } = await supabase
			.from('events')
			.select('*')
			.eq('status', 'upcoming')
			.order('start_datetime', { ascending: true });

		if (error) throw error;
		return data as AttendanceEvent[];
	},

	/**
	 * Scan a member into an event using optimized atomic transaction.
	 */
	async scanMember(memberId: string, eventId: number, scanTime?: Date | null) {
		const timestamp = scanTime ? scanTime.toISOString() : new Date().toISOString();

		// Convert UTC ISO to naive timestamp string for PostgreSQL to ingest properly
		const naïveTimestamp = timestamp.replace('T', ' ').replace('Z', '');

		const { data, error } = await supabase.rpc('scan_member_transaction', {
			p_member_id: memberId,
			p_event_id: eventId,
			p_scan_time: naïveTimestamp
		});

		if (error) throw error;

		return data as {
			success: boolean;
			message: string;
			member_name?: string;
			care_group?: string;
			member_id?: string;
		};
	},

	/**
	 * Check if a member is already checked into an event (fast boolean check)
	 */
	async isAlreadyScanned(memberId: string, eventId: number) {
		const { data, error } = await supabase.rpc('check_already_scanned', {
			p_member_id: memberId,
			p_event_id: eventId
		});

		if (error) throw error;
		return data as boolean;
	},

	/**
	 * Get scan history for a specific event (real-time view)
	 */
	async getEventScans(eventId: number) {
		const { data, error } = await supabase
			.from('attendance_scans')
			.select(
				`
				*,
				members (
					first_name,
					last_name,
					member_id
				)
			`
			)
			.eq('event_id', eventId)
			.order('scan_datetime', { ascending: false });

		if (error) throw error;
		return data as AttendanceScanWithMember[];
	},

	/**
	 * Get confirmed attendance (present) for a specific event
	 */
	async getConfirmedAttendance(eventId: number) {
		const { data, error } = await supabase
			.from('attendance_present')
			.select(
				`
				*,
				members (
					first_name,
					last_name,
					member_id
				)
			`
			)
			.eq('event_id', eventId);

		if (error) throw error;
		return data as AttendancePresentWithMember[];
	},

	/**
	 * Get attendance history for a specific member
	 */
	async getMemberAttendanceHistory(memberId: string) {
		const { data, error } = await supabase
			.from('attendance_present')
			.select(
				`
				*,
				events (
					event_name,
					event_date
				)
			`
			)
			.eq('member_id', memberId);

		if (error) throw error;
		return data as AttendanceHistoryWithEvent[];
	},

	/**
	 * Live headcount for an ongoing event.
	 *
	 * `expected` is every member on file, which is the same population
	 * process_event_attendance() marks absent when the event completes - so the live rate and
	 * the recorded one agree. Events carry no target roster, so there is nothing narrower.
	 */
	async getLiveStats(eventId: number): Promise<LiveStats> {
		const [present, expected] = await Promise.all([
			supabase
				.from('attendance_scans')
				.select('*', { count: 'exact', head: true })
				.eq('event_id', eventId),
			supabase.from('members').select('*', { count: 'exact', head: true })
		]);

		if (present.error) throw asError(present.error, 'Counting scans for this event');
		if (expected.error) throw asError(expected.error, 'Counting members');

		return { present: present.count ?? 0, expected: expected.count ?? 0 };
	},

	/**
	 * Newest scans for one event.
	 *
	 * Scoped to the event on purpose: the live view used to list the newest scans across all
	 * events, so a session could show check-ins belonging to a different one - and disagree
	 * with /attendance/all-scans, which has always been scoped.
	 */
	async getRecentScans(eventId: number, limit = 20) {
		const { data, error } = await supabase
			.from('attendance_scans')
			.select('scan_id, member_id, scan_datetime, members(first_name, last_name, groups(name))')
			.eq('event_id', eventId)
			.order('scan_datetime', { ascending: false })
			.limit(limit);

		if (error) throw asError(error, 'Loading recent scans');

		return (data ?? []).map((row) => {
			const member = row.members as unknown as {
				first_name?: string;
				last_name?: string;
				groups?: { name?: string } | null;
			} | null;

			return {
				scan_id: row.scan_id,
				member_id: row.member_id,
				first_name: member?.first_name ?? 'Unknown',
				last_name: member?.last_name ?? 'Member',
				care_group: member?.groups?.name ?? '-',
				scan_datetime: row.scan_datetime
			} satisfies RosterEntry & { scan_id: string };
		});
	},

	/**
	 * Headcounts for every completed event in a date range, in one round trip.
	 *
	 * Replaces counting in a client loop - the history page used to fetch every completed
	 * event ever and then issue two roster queries per event.
	 */
	async getAttendanceSummary(from: string, to: string): Promise<AttendanceSummaryRow[]> {
		const { data, error } = await supabase.rpc('get_attendance_summary', {
			p_from: from,
			p_to: to
		});

		if (error) throw asError(error, `Loading the attendance summary for ${from} to ${to}`);
		return (data ?? []) as AttendanceSummaryRow[];
	},

	/**
	 * Dates of all completed events, for building the month strip.
	 *
	 * Deliberately selects one column and no joins: the strip has to render before any
	 * roster is fetched, otherwise picking a month means waiting for the whole archive.
	 */
	async getCompletedEventDates(): Promise<string[]> {
		const { data, error } = await supabase
			.from('events')
			.select('event_date')
			.eq('status', 'completed')
			.order('event_date', { ascending: false });

		if (error) throw asError(error, 'Loading the list of months');
		return (data ?? []).map((row) => row.event_date as string);
	},

	/** One event's roster, fetched when the row is expanded rather than up front. */
	async getEventRoster(eventId: number, kind: RosterKind): Promise<RosterEntry[]> {
		const table = kind === 'present' ? 'attendance_present' : 'attendance_absent';
		const columns =
			kind === 'present'
				? 'member_id, scan_datetime, members(first_name, last_name, groups(name))'
				: 'member_id, members(first_name, last_name, groups(name))';

		const query = supabase.from(table).select(columns).eq('event_id', eventId);
		const { data, error } =
			kind === 'present' ? await query.order('scan_datetime', { ascending: false }) : await query;

		if (error) throw asError(error, `Loading the ${kind} roster`);

		return (data ?? []).map((row) => {
			const entry = row as unknown as {
				member_id: string;
				scan_datetime?: string;
				members?: {
					first_name?: string;
					last_name?: string;
					groups?: { name?: string } | null;
				} | null;
			};

			return {
				member_id: entry.member_id,
				first_name: entry.members?.first_name ?? 'Unknown',
				last_name: entry.members?.last_name ?? 'Member',
				care_group: entry.members?.groups?.name ?? '-',
				scan_datetime: entry.scan_datetime ?? null
			};
		});
	},

	/**
	 * Watch one event's scans and call back on any change.
	 *
	 * Refetches rather than patching from the payload, matching the subscription in
	 * settings/profile: the callback can then recompute counts and ordering the same way the
	 * initial load does, with no second code path to keep in step.
	 *
	 * Returns a disposer. Realtime needs attendance_scans in the supabase_realtime
	 * publication (migration 007); without it the channel simply never fires, which is why
	 * callers also revalidate on focus.
	 */
	subscribeToEventScans(eventId: number, onChange: () => void): () => void {
		const channel = supabase
			.channel(`attendance-scans:${eventId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'attendance_scans',
					filter: `event_id=eq.${eventId}`
				},
				() => onChange()
			)
			.subscribe();

		return () => {
			void supabase.removeChannel(channel);
		};
	}
};

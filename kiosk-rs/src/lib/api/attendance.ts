import { supabase } from '$lib/supabase';

/**
 * The scan slice of the web app's src/lib/api/attendance.ts, and nothing else.
 *
 * The web app's version is 454 lines covering summaries, rosters, history and analytics. A
 * kiosk takes scans at a door, so only the four calls it actually needs are carried over -
 * keeping this file small is deliberate, not an oversight.
 *
 * Signatures are kept identical to the web app's so fixes can move between the two.
 */

/** An event row, as the web app's AttendanceEvent. Only the fields the kiosk reads. */
export interface KioskEventRow {
	event_id: number;
	event_name: string;
	start_datetime: string;
	end_datetime: string;
	status: string;
}

/** What scan_member_transaction returns. Shape copied from the web app verbatim. */
export interface ScanRpcResult {
	success: boolean;
	message: string;
	member_name?: string;
	care_group?: string;
	member_id?: string;
}

export const attendanceApi = {
	/**
	 * Ask the database to re-evaluate every event's status.
	 *
	 * `update_event_statuses()` is **lazy** - nothing in Supabase runs it on a schedule, so an
	 * event only flips `upcoming -> ongoing -> completed` when some client asks. The web app's
	 * scan page calls this before every event load for exactly that reason. Without it a kiosk
	 * left running alone keeps showing the scan screen for an event whose end time passed
	 * hours ago, and sits in "Starting now" for one that should already be live.
	 *
	 * Note this is a write: completing an event also runs `process_event_attendance`, which
	 * records absentees. That is the main system's intended behaviour, not a kiosk side effect
	 * - but it is why the call belongs here rather than being fired off casually.
	 */
	async refreshEventStatuses() {
		const { error } = await supabase.rpc('update_event_statuses', {});
		// Non-fatal: stale statuses are better than a blank screen, and the next poll retries.
		if (error) console.error('[attendance] update_event_statuses failed', error);
	},

	/** Events currently 'ongoing'. The kiosk scans into the first one unless an event is pinned. */
	async getOngoingEvents(): Promise<KioskEventRow[]> {
		const { data, error } = await supabase
			.from('events')
			.select('event_id, event_name, start_datetime, end_datetime, status')
			.eq('status', 'ongoing');

		if (error) throw error;
		return (data ?? []) as KioskEventRow[];
	},

	/** Next scheduled events, for the standby countdown. */
	async getUpcomingEvents(): Promise<KioskEventRow[]> {
		const { data, error } = await supabase
			.from('events')
			.select('event_id, event_name, start_datetime, end_datetime, status')
			.eq('status', 'upcoming')
			.order('start_datetime', { ascending: true });

		if (error) throw error;
		return (data ?? []) as KioskEventRow[];
	},

	/**
	 * One check-in, via the atomic server RPC. The RPC owns all validation - duplicate
	 * detection, event timing, membership - so the kiosk never second-guesses it.
	 *
	 * Note the naive-timestamp conversion: PostgreSQL stores a bare TIMESTAMP, so the `Z` and
	 * `T` are stripped rather than sent as UTC. Carried over from the web app unchanged.
	 */
	async scanMember(memberId: string, eventId: number, scanTime?: Date | null) {
		const timestamp = scanTime ? scanTime.toISOString() : new Date().toISOString();
		const naiveTimestamp = timestamp.replace('T', ' ').replace('Z', '');

		const { data, error } = await supabase.rpc('scan_member_transaction', {
			p_member_id: memberId,
			p_event_id: eventId,
			p_scan_time: naiveTimestamp
		});

		if (error) throw error;
		return data as ScanRpcResult;
	},

	/** Live checked-in count for the status line under the strip. */
	async getCheckedInCount(eventId: number): Promise<number> {
		const { count, error } = await supabase
			.from('attendance_scans')
			.select('*', { count: 'exact', head: true })
			.eq('event_id', eventId);

		if (error) throw error;
		return count ?? 0;
	}
};

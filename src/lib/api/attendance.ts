import { supabase } from '$lib/supabase';
import type {
	AttendanceEvent,
	AttendanceScanWithMember,
	AttendancePresentWithMember,
	AttendanceHistoryWithEvent
} from '$lib/types';

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
	}
};

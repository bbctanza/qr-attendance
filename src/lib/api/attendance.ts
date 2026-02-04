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
        if (error) console.error("Failed to refresh event statuses:", error);
    },

	/**
	 * Get all currently 'ongoing' events.
	 * Used by the scanner to determine if scanning is allowed.
	 */
	async getOngoingEvents() {
        // Optional: Lazily update statuses before fetching
        // await attendanceApi.refreshEventStatuses(); 
        
		const { data, error } = await supabase
			.from('events')
			.select('*')
			.eq('status', 'ongoing');

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
	 * Scan a member into an event.
	 * 1. Checks if already scanned in `attendance_scans`
	 * 2. Checks if already present in `attendance_present` (history)
	 * 3. Inserts into `attendance_scans`
	 */
	async scanMember(memberId: string, eventId: number, scanTime?: Date | null) {
		// 1. Check if already in temporary scans
		const { data: existingScan, error: scanCheckError } = await supabase
			.from('attendance_scans')
			.select('scan_id')
			.eq('member_id', memberId)
			.eq('event_id', eventId)
			.maybeSingle();

		if (scanCheckError) throw scanCheckError;

		if (existingScan) {
			return { success: false, message: 'Already scanned (pending processing).' };
		}

		// 2. Check if already permanently recorded (e.g. if they left and came back later after a sync)
		const { data: existingPresent, error: presentCheckError } = await supabase
			.from('attendance_present')
			.select('present_id')
			.eq('member_id', memberId)
			.eq('event_id', eventId)
			.maybeSingle();

		if (presentCheckError) throw presentCheckError;

		if (existingPresent) {
			return { success: false, message: 'Already marked as present.' };
		}

		// 3. Insert scan
		// We use crypto.randomUUID() which is standard in most modern environments
		const scanId = crypto.randomUUID();
        const timestamp = scanTime ? scanTime.toISOString() : new Date().toISOString();
        
		const { error: insertError } = await supabase
			.from('attendance_scans')
			.insert({
				scan_id: scanId,
				member_id: memberId,
				event_id: eventId,
				scan_datetime: timestamp
			});

		if (insertError) throw insertError;

		return { success: true, message: 'Scan successful!' };
	},

	/**
	 * Get scan history for a specific event (real-time view)
	 */
	async getEventScans(eventId: number) {
		const { data, error } = await supabase
			.from('attendance_scans')
			.select(`
				*,
				members (
					first_name,
					last_name,
					member_id
				)
			`)
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
			.select(`
				*,
				members (
					first_name,
					last_name,
					member_id
				)
			`)
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
			.select(`
				*,
				events (
					event_name,
					event_date
				)
			`)
			.eq('member_id', memberId);

		if (error) throw error;
		return data as AttendanceHistoryWithEvent[];
	}
};

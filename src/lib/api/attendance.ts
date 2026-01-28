import { supabase } from '$lib/supabase';
import type { AttendanceEvent, AttendanceScan } from '$lib/types';
import { v4 as uuidv4 } from 'uuid'; // We might need a UUID generator if scan_id isn't auto-generated, but usually client generates or DB default.
// The schema says scan_id TEXT PRIMARY KEY. It doesn't say DEFAULT gen_random_uuid().
// We should probably generate it here.
// But wait, I don't have uuid installed. I can use crypto.randomUUID() if environment supports it, or just let supabase handle it if I change schema?
// user said "Read Schema.sql". Schema: scan_id TEXT PRIMARY KEY. No default.
// I will use crypto.randomUUID() (native in modern generic JS/Browsers/Node/Vite).

export const attendanceApi = {
	/**
	 * Get all currently 'ongoing' events.
	 * Used by the scanner to determine if scanning is allowed.
	 */
	async getOngoingEvents() {
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
	async scanMember(memberId: string, eventId: number) {
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
		const { error: insertError } = await supabase
			.from('attendance_scans')
			.insert({
				scan_id: scanId,
				member_id: memberId,
				event_id: eventId,
				scan_datetime: new Date().toISOString()
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
		return data; // Typed as any with join, strictly we'd define a Joined type
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
		return data;
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
		return data;
	}
};

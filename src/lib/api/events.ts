import { supabase } from '$lib/supabase';
import type { AttendanceEvent, EventType, EventStatus } from '$lib/types';

export const eventsApi = {
	/**
	 * Get all active event types for a specific day of the week.
	 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
	 */
	async getEventTypesForDay(dayOfWeek: number) {
		const { data, error } = await supabase
			.from('event_types')
			.select('*')
			.eq('day_of_week', dayOfWeek)
			.eq('is_active', true);

		if (error) throw error;
		return data as EventType[];
	},

	/**
	 * Get events for a specific date (to check for duplicates).
	 */
	async getEventsByDate(dateStr: string) {
		// dateStr should be YYYY-MM-DD
		const { data, error } = await supabase
			.from('events')
			.select('*')
			.eq('event_date', dateStr);

		if (error) throw error;
		return data as AttendanceEvent[];
	},

	/**
	 * Create a new event instance.
	 */
	async createEvent(eventData: Partial<AttendanceEvent>) {
		const { data, error } = await supabase
			.from('events')
			.insert(eventData)
			.select()
			.single();

		if (error) throw error;
		return data as AttendanceEvent;
	},

	/**
	 * Get events that need status updates (upcoming, ongoing).
	 * We generally want to check everything that isn't 'completed' or specifically 'upcoming'/'ongoing'.
	 */
	async getActiveEvents() {
		const { data, error } = await supabase
			.from('events')
			.select('*')
			.in('status', ['upcoming', 'ongoing']);

		if (error) throw error;
		return data as AttendanceEvent[];
	},

	/**
	 * Update the status of an event.
	 */
	async updateEventStatus(eventId: number, status: EventStatus) {
		const { data, error } = await supabase
			.from('events')
			.update({ status })
			.eq('event_id', eventId)
			.select()
			.single();

		if (error) throw error;
		return data as AttendanceEvent;
	},

	/**
	 * Get completed events that might need processing (archival).
	 * Ideally, we'd have a flag 'is_processed' or check if rows exist in 'attendance_scans'.
	 * Based on the schema, `process_event_attendance` clears `attendance_scans`.
	 * So we find completed events that still have associated scans in `attendance_scans`.
	 */
	async getCompletedEventsWithPendingScans() {
		// access "events" where status = 'completed' AND exists in "attendance_scans"
		// Supabase/PostgREST doesn't support easy "EXISTS" filters in the JS client without complex embedding.
		// A simpler approach for the client:
		// 1. Get all events with status 'completed' AND created recently (e.g. today).
		// 2. Or, simpler: Just call the RPC for all recently completed events. It's safe/idempotent-ish (except the insert conflict do nothing).
		
		// Let's try to query attendance_scans to get unique event_ids, then filter those events.
		
        const { data: scans, error: scanError } = await supabase
            .from('attendance_scans')
            .select('event_id');

        if (scanError) throw scanError;

        if (!scans || scans.length === 0) return [];

        const eventIds = [...new Set(scans.map(s => s.event_id))];

        const { data: events, error: eventError } = await supabase
            .from('events')
            .select('*')
            .in('event_id', eventIds)
            .eq('status', 'completed');

        if (eventError) throw eventError;

        return events as AttendanceEvent[];
	},

	/**
	 * Trigger the database stored procedure to archive attendance.
	 */
	async processEventAttendance(eventId: number) {
		const { error } = await supabase.rpc('process_event_attendance', {
			p_event_id: eventId
		});

		if (error) throw error;
		return true;
	}
};

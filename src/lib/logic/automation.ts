import { eventsApi } from '$lib/api/events';
import type { AttendanceEvent, EventType } from '$lib/types';

export class AutomationEngine {
	private creationIntervalId: ReturnType<typeof setInterval> | undefined;
	private statusIntervalId: ReturnType<typeof setInterval> | undefined;
	private archivalIntervalId: ReturnType<typeof setInterval> | undefined;

	constructor() {}

	/**
	 * Starts all automation jobs with their respective intervals.
	 */
	start() {
		console.log('🔄 Automation Engine Started');

		// 1. Event Creation (Client-side generation removed in favor of manual/server batches)
        // Kept empty to prevent unintended local generation conflicts with the new recurring logic
	}

	stop() {
		console.log('⏹ Automation Engine Stopped');
		if (this.creationIntervalId) clearInterval(this.creationIntervalId);
		if (this.statusIntervalId) clearInterval(this.statusIntervalId);
		if (this.archivalIntervalId) clearInterval(this.archivalIntervalId);
	}

	// ==========================================
	// JOB 1: Event Creation
	// ==========================================
	async runEventCreationJob() {
		try {
			const now = new Date();
			const dayOfWeek = now.getDay(); // 0-6
			const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

			console.log(`[Job] Creation: Checking for events on ${dateStr} (Day ${dayOfWeek})`);

			// 1. Get templates for today
			const eventTypes = await eventsApi.getEventTypesForDay(dayOfWeek);
			if (!eventTypes || eventTypes.length === 0) {
				// console.log('[Job] Creation: No event templates for today.');
				return;
			}

			// 2. Get existing events for today to avoid duplicates
			const existingEvents = await eventsApi.getEventsByDate(dateStr);
			
			// 3. Process each template
			for (const type of eventTypes) {
				const alreadyExists = existingEvents.some(e => e.event_type_id === type.event_type_id);
				
				if (!alreadyExists) {
					console.log(`[Job] Creation: Creating event from template "${type.name}"`);
					await this.createEventFromTemplate(type, dateStr);
				}
			}
		} catch (error) {
			console.error('[Job] Creation Error:', error);
		}
	}

	private async createEventFromTemplate(type: EventType, dateStr: string) {
		// Combine dateStr and time string to ISO
		const startDt = new Date(`${dateStr}T${type.start_time}`);
		const endDt = new Date(`${dateStr}T${type.end_time}`);

		const newEvent: Partial<AttendanceEvent> = {
			event_type_id: type.event_type_id,
			event_name: type.name, // Can be customized later
			event_date: dateStr,
			start_datetime: startDt.toISOString(),
			end_datetime: endDt.toISOString(),
			status: 'upcoming',
			is_custom: false,
			metadata: {}
		};

		await eventsApi.createEvent(newEvent);
	}

	// ==========================================
	// JOB 2: Status Updates
	// ==========================================
	async runStatusUpdateJob() {
		try {
			// console.log('[Job] Status: Checking for updates...');
			const now = new Date();
			const activeEvents = await eventsApi.getActiveEvents();

			for (const event of activeEvents) {
				const start = new Date(event.start_datetime);
				const end = new Date(event.end_datetime);

				// Upcoming -> Ongoing
				if (event.status === 'upcoming' && now >= start && now < end) {
					console.log(`[Job] Status: Starting event "${event.event_name}"`);
					await eventsApi.updateEventStatus(event.event_id, 'ongoing');
				}
				// Ongoing -> Completed
				else if (event.status === 'ongoing' && now >= end) {
					console.log(`[Job] Status: Completing event "${event.event_name}"`);
					await eventsApi.updateEventStatus(event.event_id, 'completed');
				}
                // Edge case: Upcoming -> Completed (if missed entirely? Optional logic, skipping for now)
			}
		} catch (error) {
			console.error('[Job] Status Error:', error);
		}
	}

	// ==========================================
	// JOB 3: Archival Process
	// ==========================================
	async runArchivalJob() {
		try {
			// console.log('[Job] Archival: Checking for pending scans...');
			// Finds events that are 'completed' but still have rows in 'attendance_scans'
			const eventsToProcess = await eventsApi.getCompletedEventsWithPendingScans();

			if (eventsToProcess.length > 0) {
				console.log(`[Job] Archival: Found ${eventsToProcess.length} events to process.`);
				
				for (const event of eventsToProcess) {
					console.log(`[Job] Archival: Processing attendance for "${event.event_name}"`);
					await eventsApi.processEventAttendance(event.event_id);
				}
			}
		} catch (error) {
			console.error('[Job] Archival Error:', error);
		}
	}
}

export const automation = new AutomationEngine();

import { eventsApi } from '$lib/api/events';
import type { AttendanceEvent, EventType } from '$lib/types';
import { convertToUTC } from '$lib/utils/time';

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

		// Job 1: Event Creation (every 10 minutes)
		this.creationIntervalId = setInterval(() => {
			this.runEventCreationJob();
		}, 10 * 60 * 1000);

		// Job 2: Status Updates (every 30 seconds)
		this.statusIntervalId = setInterval(() => {
			this.runStatusUpdateJob();
		}, 30 * 1000);

		// Job 3: Archival (every 60 seconds)
		this.archivalIntervalId = setInterval(() => {
			this.runArchivalJob();
		}, 60 * 1000);

		// Run jobs immediately on start
		this.runEventCreationJob();
		this.runStatusUpdateJob();
		this.runArchivalJob();
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
			let now = new Date();

			// Check for mock time in localStorage
			if (typeof window !== 'undefined') {
				const mockTimeStr = localStorage.getItem('dev_mock_time');
				if (mockTimeStr) {
					now = new Date(mockTimeStr);
				}
			}

			// Get user timezone to determine what "today" is
			let userTimezone = 'UTC';
			if (typeof window !== 'undefined') {
				try {
					const settingsToLoad = localStorage.getItem('systemSettings');
					if (settingsToLoad) {
						const settings = JSON.parse(settingsToLoad);
						userTimezone = settings.timezone || 'UTC';
					}
				} catch (e) {
					// Fallback
				}
			}

			console.log(`[Job] Creation: Running scan for recurring events (TZ: ${userTimezone})`);

			// Process Today and the next 6 days (1 week window)
			for (let i = 0; i < 7; i++) {
				const targetDate = new Date(now);
				targetDate.setDate(now.getDate() + i);

				// Format date in user's timezone
				const localDateStr = targetDate.toLocaleDateString('en-CA', { timeZone: userTimezone });
				const localDayName = new Intl.DateTimeFormat('en-US', {
					timeZone: userTimezone,
					weekday: 'long'
				}).format(targetDate);

				const weekdayMap: Record<string, number> = {
					Sunday: 0,
					Monday: 1,
					Tuesday: 2,
					Wednesday: 3,
					Thursday: 4,
					Friday: 5,
					Saturday: 6
				};
				const dayOfWeek = weekdayMap[localDayName];

				// 1. Get templates for this day of week
				const eventTypes = await eventsApi.getEventTypesForDay(dayOfWeek);
				if (!eventTypes || eventTypes.length === 0) continue;

				// 2. Process each template (get fresh events for each to prevent race conditions)
				for (const type of eventTypes) {
					// Re-fetch before each creation to prevent duplicates from concurrent runs
					const existingEvents = await eventsApi.getEventsByDate(localDateStr);
					const alreadyExists = existingEvents.some(e => e.event_type_id === type.event_type_id);
					
					if (!alreadyExists) {
						console.log(`[Job] Creation: Creating event for ${localDateStr} from template "${type.name}"`);
						await this.createEventFromTemplate(type, localDateStr, userTimezone);
					}
				}
			}
		} catch (error) {
			console.error('[Job] Creation Error:', error);
		}
	}

	private async createEventFromTemplate(type: EventType, dateStr: string, timezone: string) {
		// Use the already imported convertToUTC utility
		const startDt = await convertToUTC(dateStr, type.start_time);
		const endDt = await convertToUTC(dateStr, type.end_time);

		const newEvent: Partial<AttendanceEvent> = {
			event_type_id: type.event_type_id,
			event_name: type.name,
			event_date: dateStr,
			start_datetime: startDt, // Now correctly converted to UTC string
			end_datetime: endDt,     // Now correctly converted to UTC string
			status: 'upcoming',
			is_custom: false,
			is_recurring: true, // Mark as recurring
			description: 'Automatically generated from recurring schedule',
			metadata: type.metadata || {}
		};

		await eventsApi.createEvent(newEvent);
	}

	// ==========================================
	// JOB 2: Status Updates
	// ==========================================
	async runStatusUpdateJob() {
		try {
			let now = new Date();
			
			// Check for mock time in localStorage to support Developer Tools
			let isMock = false;
			if (typeof window !== 'undefined') {
				const mockTimeStr = localStorage.getItem('dev_mock_time');
				if (mockTimeStr) {
					now = new Date(mockTimeStr);
					isMock = true;
				}
			}

			const activeEvents = await eventsApi.getActiveEvents();

			// Get user timezone (default to UTC if not available)
			let userTimezone = 'UTC';
			if (typeof window !== 'undefined') {
				try {
					const settingsStr = localStorage.getItem('systemSettings');
					if (settingsStr) {
						const settings = JSON.parse(settingsStr);
						userTimezone = settings.timezone || 'UTC';
					}
				} catch (e) {
					console.warn('Could not load timezone from localStorage');
				}
			}

			if (isMock || activeEvents.length > 0) {
				console.log(`[Job] Status: Checking ${activeEvents.length} active events. Time:`, now.toISOString(), isMock ? '(MOCK)' : '(REAL)');
			}

			for (const event of activeEvents) {
				// Database times are UTC (without Z suffix)
				// Parse them as UTC
				const start = new Date(event.start_datetime + 'Z');
				const end = new Date(event.end_datetime + 'Z');

				const startLocal = this.formatTimeInTimezone(start, userTimezone);
				const endLocal = this.formatTimeInTimezone(end, userTimezone);
				const nowLocal = this.formatTimeInTimezone(now, userTimezone);

				console.log(`[Job] Status: Event "${event.event_name}" (${event.event_id}) - Start: ${start.toISOString()} vs Now: ${now.toISOString()}`);

				// Upcoming -> Ongoing (compare in UTC)
				if (event.status === 'upcoming' && now >= start && now < end) {
					console.log(`[Job] Status: ✅ Starting event "${event.event_name}"`);
					await eventsApi.updateEventStatus(event.event_id, 'ongoing');
				}
				// Ongoing -> Completed (compare in UTC)
				else if (event.status === 'ongoing' && now >= end) {
					console.log(`[Job] Status: ✅ Completing event "${event.event_name}"`);
					await eventsApi.updateEventStatus(event.event_id, 'completed');
				}
				// Special Case: Upcoming -> Completed (Skipped event / missed window)
				// If the event hasn't started yet but we are already past the end time.
				else if (event.status === 'upcoming' && now >= end) {
					console.log(`[Job] Status: ⚠️ Event "${event.event_name}" missed/finished. Marking as completed.`);
					await eventsApi.updateEventStatus(event.event_id, 'completed');
				}
			}
		} catch (error) {
			console.error('[Job] Status Error:', error);
		}
	}

	// Helper to format time in a specific timezone
	private formatTimeInTimezone(date: Date, timezone: string): string {
		try {
			return date.toLocaleString('en-US', { timeZone: timezone });
		} catch (e) {
			return date.toISOString();
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

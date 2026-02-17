/**
 * Audit-Wrapped API
 * Wraps existing API calls with automatic audit logging
 * Integrates with devTools store to respect audit settings
 */

import { supabase } from '$lib/supabase';
import { membersApi } from './members';
import { eventsApi } from './events';
import { eventTypesApi } from './event_types';
import { logAuditChange } from '$lib/utils/auditLogger';
import { devTools } from '$lib/stores/dev';
import type { Member, AttendanceEvent, EventType, EventStatus } from '$lib/types';

// Configuration cache
const auditSettingsCache: { enabled: boolean; gdprMode: boolean } = {
	enabled: true,
	gdprMode: false
};

// Subscribe to dev settings changes
if (typeof window !== 'undefined') {
	devTools.subscribe((state) => {
		auditSettingsCache.enabled = state.auditTrailEnabled;
		auditSettingsCache.gdprMode = state.gdprModeEnabled;
	});
}

/**
 * Get current session for audit logging
 */
async function getCurrentSession() {
	const {
		data: { session }
	} = await supabase.auth.getSession();
	return session;
}

/**
 * Audited Members API
 */
export const auditedMembersApi = {
	async getAll() {
		return membersApi.getAll();
	},

	async getById(memberId: string) {
		return membersApi.getById(memberId);
	},

	/**
	 * Create or Update a member with audit logging
	 */
	async upsert(member: Partial<Member>) {
		const session = await getCurrentSession();

		// Get existing member if updating
		let existingMember: Member | null = null;
		let isCreate = false;

		try {
			existingMember = await membersApi.getById(member.member_id!);
		} catch {
			isCreate = true;
		}

		// Perform the upsert
		const result = await membersApi.upsert(member);

		// Log the change if audit is enabled
		if (auditSettingsCache.enabled) {
			await logAuditChange(
				{
					entityType: 'member',
					entityId: result.member_id,
					action: isCreate ? 'create' : 'update',
					before: existingMember ? JSON.parse(JSON.stringify(existingMember)) : undefined,
					after: JSON.parse(JSON.stringify(result)),
					tags: ['manual-entry']
				},
				session
			);
		}

		return result;
	},

	/**
	 * Delete a member with audit logging
	 */
	async delete(memberId: string) {
		const session = await getCurrentSession();

		// Get member before deletion for audit trail
		let memberBeforeDeletion: Member | null = null;
		try {
			memberBeforeDeletion = await membersApi.getById(memberId);
		} catch (error) {
			console.warn('Could not fetch member before deletion for audit:', error);
			// Continue with deletion even if we can't get the before state
		}

		// Perform deletion
		const result = await membersApi.delete(memberId);

		// Log the deletion even without the before state
		if (auditSettingsCache.enabled) {
			await logAuditChange(
				{
					entityType: 'member',
					entityId: memberId,
					action: 'delete',
					before: memberBeforeDeletion ? JSON.parse(JSON.stringify(memberBeforeDeletion)) : undefined,
					after: undefined,
					tags: ['manual-entry']
				},
				session
			);

			// Mark member as anonymized if GDPR mode is on
			if (auditSettingsCache.gdprMode) {
				// Would call GDPR compliance function here
				// For now, just flag the audit logs
			}
		}

		return result;
	}
};

/**
 * Audited Events API
 */
export const auditedEventsApi = {
	async getEventTypesForDay(dayOfWeek: number) {
		return eventsApi.getEventTypesForDay(dayOfWeek);
	},

	async getEventsByDate(dateStr: string) {
		return eventsApi.getEventsByDate(dateStr);
	},

	/**
	 * Create event with audit logging
	 */
	async createEvent(eventData: Partial<AttendanceEvent>) {
		const session = await getCurrentSession();

		const result = await eventsApi.createEvent(eventData);

		if (auditSettingsCache.enabled) {
			await logAuditChange(
				{
					entityType: 'event',
					entityId: result.event_id.toString(),
					action: 'create',
					before: undefined,
					after: JSON.parse(JSON.stringify(result)),
					tags: ['auto-system']
				},
				session
			);
		}

		return result;
	},

	async getActiveEvents() {
		return eventsApi.getActiveEvents();
	},

	/**
	 * Update event status with audit logging
	 */
	async updateEventStatus(eventId: number, newStatus: string) {
		const session = await getCurrentSession();

		// Get existing event
		const { data: existingEvent } = await supabase
			.from('events')
			.select('*')
			.eq('event_id', eventId)
			.single();

		// Update status
		const result = await eventsApi.updateEventStatus(eventId, newStatus as EventStatus);

		// Log the change
		if (auditSettingsCache.enabled && existingEvent) {
			await logAuditChange(
				{
					entityType: 'event',
					entityId: eventId.toString(),
					action: 'update',
					before: JSON.parse(JSON.stringify(existingEvent)),
					after: JSON.parse(JSON.stringify(result)),
					reason: `Status changed to ${newStatus}`,
					tags: ['auto-system']
				},
				session
			);
		}

		return result;
	},

	async getCompletedEventsWithPendingScans() {
		return eventsApi.getCompletedEventsWithPendingScans();
	},

	/**
	 * Delete an event with audit logging
	 */
	async deleteEvent(eventId: number) {
		const session = await getCurrentSession();

		// Get event before deletion for audit trail
		let eventBeforeDeletion: AttendanceEvent | null = null;
		try {
			const { data } = await supabase
				.from('events')
				.select('*')
				.eq('event_id', eventId)
				.single();
			eventBeforeDeletion = data;
		} catch (error) {
			console.warn('Could not fetch event before deletion for audit:', error);
		}

		// Perform deletion
		const result = await eventsApi.deleteEvent(eventId);

		// Log the deletion
		if (auditSettingsCache.enabled && eventBeforeDeletion) {
			await logAuditChange(
				{
					entityType: 'event',
					entityId: eventId.toString(),
					action: 'delete',
					before: JSON.parse(JSON.stringify(eventBeforeDeletion)),
					after: undefined,
					tags: ['manual-entry']
				},
				session
			);
		}

		return result;
	},

	/**
	 * Update an event with audit logging
	 */
	async updateEvent(eventId: number, eventData: Partial<AttendanceEvent>) {
		const session = await getCurrentSession();

		// Get existing event
		let existingEvent: AttendanceEvent | null = null;
		try {
			const { data } = await supabase
				.from('events')
				.select('*')
				.eq('event_id', eventId)
				.single();
			existingEvent = data;
		} catch (error) {
			console.warn('Could not fetch event before update for audit:', error);
		}

		// Perform update
		const result = await eventsApi.updateEvent(eventId, eventData);

		// Log the change
		if (auditSettingsCache.enabled && existingEvent) {
			await logAuditChange(
				{
					entityType: 'event',
					entityId: eventId.toString(),
					action: 'update',
					before: JSON.parse(JSON.stringify(existingEvent)),
					after: JSON.parse(JSON.stringify(result)),
					tags: ['manual-entry']
				},
				session
			);
		}

		return result;
	}
};

/**
 * Audited Event Types API
 */
export const auditedEventTypesApi = {
	async getAll() {
		return eventTypesApi.getAll();
	},

	/**
	 * Create an event type with audit logging
	 */
	async create(eventType: Partial<EventType>) {
		const session = await getCurrentSession();

		const result = await eventTypesApi.create(eventType);

		if (auditSettingsCache.enabled) {
			await logAuditChange(
				{
					entityType: 'event',
					entityId: `type-${result.event_type_id}`,
					action: 'create',
					before: undefined,
					after: JSON.parse(JSON.stringify(result)),
					tags: ['event-type', 'manual-entry']
				},
				session
			);
		}

		return result;
	},

	/**
	 * Update an event type with audit logging
	 */
	async update(id: number, updates: Partial<EventType>) {
		const session = await getCurrentSession();

		// Get existing event type
		let existingEventType: EventType | null = null;
		try {
			const { data } = await supabase
				.from('event_types')
				.select('*')
				.eq('event_type_id', id)
				.single();
			existingEventType = data;
		} catch (error) {
			console.warn('Could not fetch event type before update for audit:', error);
		}

		// Perform update
		const result = await eventTypesApi.update(id, updates);

		// Log the change
		if (auditSettingsCache.enabled && existingEventType) {
			await logAuditChange(
				{
					entityType: 'event',
					entityId: `type-${id}`,
					action: 'update',
					before: JSON.parse(JSON.stringify(existingEventType)),
					after: JSON.parse(JSON.stringify(result)),
					tags: ['event-type', 'manual-entry']
				},
				session
			);
		}

		return result;
	},

	/**
	 * Delete an event type with audit logging
	 */
	async delete(id: number) {
		const session = await getCurrentSession();

		// Get event type before deletion for audit trail
		let eventTypeBeforeDeletion: EventType | null = null;
		try {
			const { data } = await supabase
				.from('event_types')
				.select('*')
				.eq('event_type_id', id)
				.single();
			eventTypeBeforeDeletion = data;
		} catch (error) {
			console.warn('Could not fetch event type before deletion for audit:', error);
		}

		// Perform deletion
		await eventTypesApi.delete(id);

		// Log the deletion
		if (auditSettingsCache.enabled && eventTypeBeforeDeletion) {
			await logAuditChange(
				{
					entityType: 'event',
					entityId: `type-${id}`,
					action: 'delete',
					before: JSON.parse(JSON.stringify(eventTypeBeforeDeletion)),
					after: undefined,
					tags: ['event-type', 'manual-entry']
				},
				session
			);
		}

		return true;
	}
};

/**
 * Bulk import with audit logging
 * Logs as a single 'import' action with count
 */
export async function auditedBulkImport(
	entityType: 'member' | 'event',
	items: Array<Record<string, unknown>>,
	importType: string
) {
	const session = await getCurrentSession();

	if (auditSettingsCache.enabled) {
		await logAuditChange(
			{
				entityType,
				entityId: 'bulk-import', // Special ID for bulk operations
				action: 'import',
				before: undefined,
				after: {
					count: items.length,
					type: importType,
					timestamp: new Date().toISOString()
				},
				reason: `Bulk import of ${items.length} ${entityType}s`,
				tags: ['bulk-import']
			},
			session
		);
	}

	return { success: true, imported: items.length };
}

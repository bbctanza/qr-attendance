/**
 * Audit Restoration Server Actions
 * Handles point-in-time recovery and undo operations
 */

import { supabase } from '$lib/supabase';
import { logAuditChange, type EntityType } from '$lib/utils/auditLogger';
import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Restore an entity to a previous state
 * Server action to ensure proper RLS bypass and transaction handling
 */
export async function restoreEntity(
	event: RequestEvent,
	{
		entityType,
		entityId,
		toVersion
	}: { entityType: string; entityId: string; toVersion: number }
) {
	try {
		// Check if user is admin
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session) {
			return fail(401, { error: 'Not authenticated' });
		}

		// Get user profile to check permissions
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', session.user.id)
			.single();

		if (!profile || !['admin', 'developer'].includes(profile.role)) {
			return fail(403, { error: 'Only admins can restore data' });
		}

		// Get the snapshot at the target version
		const snapshotResult = await getSnapshotAtVersion(
			entityType as EntityType,
			entityId,
			toVersion
		);

		if (!snapshotResult.success || !snapshotResult.data) {
			return fail(404, { error: 'Snapshot not found' });
		}

		const targetSnapshot = snapshotResult.data;

		// Get current state for before/after diff
		let currentState: Record<string, unknown> | null = null;

		if (entityType === 'member') {
			const { data } = await supabase
				.from('members')
				.select('*')
				.eq('member_id', entityId)
				.single();
			currentState = data;
		} else if (entityType === 'event') {
			const { data } = await supabase
				.from('events')
				.select('*')
				.eq('event_id', entityId)
				.single();
			currentState = data;
		}

		// Restore the entity
		const restoreData = targetSnapshot.snapshot_data;

		let restoreError = null;

		if (entityType === 'member') {
			const { error } = await supabase
				.from('members')
				.upsert({
					...restoreData,
					member_id: entityId // Ensure ID matches
				})
				.select()
				.single();

			restoreError = error;
		} else if (entityType === 'event') {
			const { error } = await supabase
				.from('events')
				.update(restoreData)
				.eq('event_id', entityId);

			restoreError = error;
		}

		if (restoreError) {
			return fail(500, { error: `Restore failed: ${restoreError.message}` });
		}

		// Log the restoration action itself
		await logAuditChange(
			{
				entityType: entityType as EntityType,
				entityId,
				action: 'restore',
				before: currentState || undefined,
				after: restoreData,
				reason: `Restored to version ${toVersion} from audit trail`,
				tags: ['restore', `v${toVersion}`]
			},
			session
		);

		return {
			success: true,
			restored: true,
			fromVersion: toVersion,
			timestamp: new Date()
		};
	} catch (error) {
		console.error('Restore error:', error);
		return fail(500, {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

/**
 * Get all versions/snapshots for an entity (for recovery preview)
 */
export async function getEntityVersionHistory(
	event: RequestEvent,
	{ entityType, entityId }: { entityType: string; entityId: string }
) {
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session) {
			return fail(401, { error: 'Not authenticated' });
		}

		// Check admin permission
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', session.user.id)
			.single();

		if (!profile || !['admin', 'developer'].includes(profile.role)) {
			return fail(403, { error: 'Only admins can view history' });
		}

		// Get all snapshots for this entity
		const { data: snapshots, error } = await supabase
			.from('audit_snapshots')
			.select('*')
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.order('version_number', { ascending: false });

		if (error) {
			return fail(500, { error: error.message });
		}

		// Get audit logs for timeline
		const { data: auditLogs } = await supabase
			.from('audit_logs')
			.select('*')
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.order('created_at', { ascending: false });

		return {
			success: true,
			snapshots: snapshots || [],
			auditLogs: auditLogs || [],
			versionCount: (snapshots || []).length
		};
	} catch (error) {
		console.error('Version history error:', error);
		return fail(500, {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

/**
 * Preview what a restore will do (show before/after)
 */
export async function previewRestore(
	event: RequestEvent,
	{ entityType, entityId, version }: { entityType: string; entityId: string; version: number }
) {
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session) {
			return fail(401, { error: 'Not authenticated' });
		}

		// Get target snapshot
		const { data: snapshot, error: snapshotError } = await supabase
			.from('audit_snapshots')
			.select('*')
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.eq('version_number', version)
			.single();

		if (snapshotError || !snapshot) {
			return fail(404, { error: 'Snapshot not found' });
		}

		// Get current state
		let currentState = null;

		if (entityType === 'member') {
			const { data } = await supabase
				.from('members')
				.select('*')
				.eq('member_id', entityId)
				.single();
			currentState = data;
		} else if (entityType === 'event') {
			const { data } = await supabase
				.from('events')
				.select('*')
				.eq('event_id', entityId)
				.single();
			currentState = data;
		}

		// Calculate diff
		const targetState = snapshot.snapshot_data;
		const diff: Record<string, { before: unknown; after: unknown }> = {};

		const allKeys = new Set([
			...Object.keys(currentState || {}),
			...Object.keys(targetState || {})
		]);

		for (const key of allKeys) {
			const currentValue = currentState?.[key];
			const targetValue = targetState?.[key];

			if (JSON.stringify(currentValue) !== JSON.stringify(targetValue)) {
				diff[key] = {
					before: currentValue,
					after: targetValue
				};
			}
		}

		return {
			success: true,
			currentState,
			targetState,
			diff,
			changedFields: Object.keys(diff).length
		};
	} catch (error) {
		console.error('Preview error:', error);
		return fail(500, {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

/**
 * Undo the last change to an entity
 * Shortcut to restore to the previous version
 */
export async function undoLastChange(
	event: RequestEvent,
	{ entityType, entityId }: { entityType: string; entityId: string }
) {
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session) {
			return fail(401, { error: 'Not authenticated' });
		}

		// Check permissions based on dev settings
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', session.user.id)
			.single();

		if (!profile) {
			return fail(401, { error: 'User profile not found' });
		}

		// Get the latest two snapshots
		const { data: snapshots, error } = await supabase
			.from('audit_snapshots')
			.select('*')
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.order('version_number', { ascending: false })
			.limit(2);

		if (error || !snapshots || snapshots.length < 2) {
			return fail(400, { error: 'Cannot undo - no previous version available' });
		}

		const previousSnapshot = snapshots[1]; // Second newest = previous version

		// Use the restore function but with previousVersion
		return restoreEntity(event, {
			entityType,
			entityId,
			toVersion: previousSnapshot.version_number
		});
	} catch (error) {
		console.error('Undo error:', error);
		return fail(500, {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

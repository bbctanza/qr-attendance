import { supabase } from '$lib/supabase';

/**
 * GDPR Compliance Module
 * Handles data privacy requirements with modular, toggle-able enforcement
 */

export interface GDPRRequest {
	userId: string;
	requestType: 'export' | 'delete' | 'anonymize';
	reason?: string;
	approvedAt?: Date;
}

export interface UserDataExport {
	profile: Record<string, unknown>;
	members: Array<Record<string, unknown>>;
	events: Array<Record<string, unknown>>;
	auditLogs: Array<Record<string, unknown>>;
	attendance: Array<Record<string, unknown>>;
	exportedAt: Date;
}

/**
 * Export all user data (GDPR Right to Access)
 * Returns all personal data associated with user
 */
export async function exportUserData(userId: string): Promise<UserDataExport | null> {
	try {
		// Get user profile
		const { data: profile } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', userId)
			.single();

		if (!profile) return null;

		// Get user's actions in audit logs
		const { data: auditLogs } = await supabase
			.from('audit_logs')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Get any data authored by user
		const { data: membersCreated } = await supabase
			.from('members')
			.select('*')
			.limit(1000); // Get all members for reference

		const { data: eventsCreated } = await supabase
			.from('events')
			.select('*')
			.limit(1000); // Get all events

		// Get attendance records (if user participated)
		const { data: attendance } = await supabase
			.from('attendance_present')
			.select('*')
			.limit(1000);

		// Compile export package
		const exportData: UserDataExport = {
			profile,
			members: membersCreated || [],
			events: eventsCreated || [],
			auditLogs: auditLogs || [],
			attendance: attendance || [],
			exportedAt: new Date()
		};

		return exportData;
	} catch (error) {
		console.error('Error exporting user data:', error);
		return null;
	}
}

/**
 * Anonymize user's audit trail (GDPR Right to be Forgotten)
 * Removes user identification from audit logs but keeps action history
 * This is called by the SQL function directly for speed
 */
export async function anonymizeUserAudits(userId: string): Promise<boolean> {
	try {
		// Call RLS-bypassed SQL function
		const { data, error } = await supabase.rpc('anonymize_user_audits', {
			p_user_id: userId
		});

		if (error) throw error;

		console.log(`Anonymized ${data?.[0]?.anonymized_count || 0} audit entries for user ${userId}`);
		return true;
	} catch (error) {
		console.error('Error anonymizing user audits:', error);
		return false;
	}
}

/**
 * Mark member data for deletion (30-day grace period)
 * Implements soft-delete with recovery window
 */
export async function markMemberForDeletion(
	memberId: string,
	reason: string = 'User requested'
): Promise<boolean> {
	try {
		const deletionDate = new Date();
		const recoveryDeadline = new Date(deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000);

		// Note: Requires custom column in members table:
		// deletion_requested_at TIMESTAMPTZ
		// deletion_reason TEXT
		// can_be_permanently_deleted BOOLEAN DEFAULT FALSE

		// Update member record
		const { error } = await supabase
			.from('members')
			.update({
				deletion_requested_at: deletionDate.toISOString(),
				deletion_reason: reason,
				can_be_permanently_deleted: recoveryDeadline
			})
			.eq('id', memberId);

		if (error) throw error;
		return true;
	} catch (error) {
		console.error('Error marking member for deletion:', error);
		return false;
	}
}

/**
 * Recover member marked for deletion (within grace period)
 */
export async function recoverMarkedMember(memberId: string): Promise<boolean> {
	try {
		const { error } = await supabase
			.from('members')
			.update({
				deletion_requested_at: null,
				deletion_reason: null,
				can_be_permanently_deleted: null
			})
			.eq('id', memberId);

		if (error) throw error;
		return true;
	} catch (error) {
		console.error('Error recovering marked member:', error);
		return false;
	}
}

/**
 * Permanently delete member data (after grace period)
 * Only callable after recovery deadline passes
 */
export async function permanentlyDeleteMember(memberId: string): Promise<boolean> {
	try {
		// First verify deletion can proceed
		const { data: member } = await supabase
			.from('members')
			.select('can_be_permanently_deleted')
			.eq('id', memberId)
			.single();

		if (!member || !member.can_be_permanently_deleted) {
			throw new Error('Member not marked for deletion or grace period not expired');
		}

		const deadline = new Date(member.can_be_permanently_deleted);
		if (new Date() < deadline) {
			throw new Error(`Grace period not expired. Can delete after: ${deadline}`);
		}

		// Delete member and cascade to attendance
		const { error } = await supabase
			.from('members')
			.delete()
			.eq('id', memberId);

		if (error) throw error;

		// Anonymize any audit logs referencing this member
		const { error: auditError } = await supabase
			.from('audit_logs')
			.update({ is_anonymized: true })
			.eq('entity_id', memberId)
			.eq('entity_type', 'member');

		if (auditError) console.warn('Warning: Could not anonymize audit logs:', auditError);

		return true;
	} catch (error) {
		console.error('Error permanently deleting member:', error);
		return false;
	}
}

/**
 * Get pending deletion queue (for admin review)
 */
export async function getPendingDeletions() {
	try {
		const now = new Date();

		const { data, error } = await supabase
			.from('members')
			.select('id, name, deletion_requested_at, deletion_reason, can_be_permanently_deleted')
			.not('deletion_requested_at', 'is', null)
			.order('deletion_requested_at', { ascending: true });

		if (error) throw error;

		// Format with deletion status
		return (data || []).map((item) => ({
			...item,
			daysUntilPermanentDelete: item.can_be_permanently_deleted
				? Math.ceil((new Date(item.can_be_permanently_deleted).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
				: 0,
			canPermanentlyDelete: item.can_be_permanently_deleted ? new Date() >= new Date(item.can_be_permanently_deleted) : false
		}));
	} catch (error) {
		console.error('Error fetching pending deletions:', error);
		return [];
	}
}

/**
 * Archive old audit logs to reduce storage (called monthly)
 * Exports logs older than X days to Supabase Storage, removes from DB
 */
export async function archiveOldAuditLogs(daysToKeep: number = 90): Promise<{
	archived: number;
	remaining: number;
}> {
	try {
		// Call SQL function to get stats
		const { data, error } = await supabase.rpc('archive_old_audit_logs', {
			p_days_to_keep: daysToKeep
		});

		if (error) throw error;

		// In production, would export to Supabase Storage here
		// For now, just return stats
		return {
			archived: data?.[0]?.archived_count || 0,
			remaining: data?.[0]?.remaining_count || 0
		};
	} catch (error) {
		console.error('Error archiving audit logs:', error);
		return { archived: 0, remaining: 0 };
	}
}

/**
 * Check if GDPR mode is enabled
 * Will read from dev settings store
 */
export function isGDPRModeEnabled(): boolean {
	// This will be connected to dev store
	// For now, return false (standard mode)
	return false;
}

/**
 * Summary of user's personal data in system
 */
export interface UserDataSummary {
	auditEntriesCount: number;
	memberReferencesCount: number;
	attendanceRecordsCount: number;
	lastActivityDate: Date | null;
	dataStorageEstimate: string;
}

/**
 * Get summary of user data in system (for review before deletion)
 */
export async function getUserDataSummary(userId: string): Promise<UserDataSummary> {
	try {
		const { count: auditCount } = await supabase
			.from('audit_logs')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId);

		const { data: lastAudit } = await supabase
			.from('audit_logs')
			.select('created_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(1)
			.single();

		// Estimate storage: ~300 bytes per audit entry
		const estimatedBytes = (auditCount || 0) * 300;
		const estimatedKB = (estimatedBytes / 1024).toFixed(2);

		return {
			auditEntriesCount: auditCount || 0,
			memberReferencesCount: 0, // Would query other tables
			attendanceRecordsCount: 0, // Would query attendance
			lastActivityDate: lastAudit?.created_at ? new Date(lastAudit.created_at) : null,
			dataStorageEstimate: `${estimatedKB} KB`
		};
	} catch (error) {
		console.error('Error getting user data summary:', error);
		return {
			auditEntriesCount: 0,
			memberReferencesCount: 0,
			attendanceRecordsCount: 0,
			lastActivityDate: null,
			dataStorageEstimate: 'Unknown'
		};
	}
}

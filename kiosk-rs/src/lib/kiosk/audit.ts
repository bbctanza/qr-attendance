import { supabase } from '$lib/supabase';
import type { KioskIdentity } from './auth';

/**
 * Audit trail for the one kiosk action that needs one: the escape hatch.
 *
 * PLAN.md section 3 - "use of the escape hatch is written to the audit log so there's a
 * trail. Individual scans are *not* separately audited - the scan RPC is already the record."
 *
 * The web app's `logAuditChange` queues entries in memory and flushes every 30 s or every 50
 * entries. That is right for an admin clicking through a settings page; it is wrong here. The
 * escape hatch is rare, security-relevant, and happens on a device that may be powered off at
 * the wall seconds later - a trail that is still sitting in a RAM queue is not a trail. So
 * this writes immediately and reports whether it landed.
 *
 * The row shape matches the web app's `audit_logs` insert exactly, so both appear identically
 * in the existing audit-log viewer.
 */

export interface EscapeHatchContext {
	/** Who the device was signed in as before the swap. */
	previousEmail: string;
	/** Who it is signed in as now. The row is attributed to this account - they did it. */
	next: KioskIdentity;
	/** Which physical device, from Kiosk Settings. */
	deviceName: string;
}

/**
 * Record that someone signed into this kiosk with their own credentials.
 *
 * Never throws: an audit write that fails must not block the operator who is standing at a
 * door trying to fix a check-in queue. It returns false and logs loudly instead.
 */
export async function logEscapeHatch(ctx: EscapeHatchContext): Promise<boolean> {
	const now = new Date().toISOString();

	const row = {
		entity_type: 'user',
		entity_id: ctx.next.userId,
		action: 'update',
		change_diff: {
			signed_in_as: { before: ctx.previousEmail, after: ctx.next.email }
		},
		user_id: ctx.next.userId,
		user_email: ctx.next.email,
		user_role: ctx.next.role ?? 'unknown',
		timestamp: now,
		// Both populated server-side for privacy, as in the web app.
		ip_address: null,
		user_agent: null,
		reason: `Kiosk escape hatch used on "${ctx.deviceName}" - session swapped from ${ctx.previousEmail}.`,
		tags: ['kiosk', 'escape-hatch'],
		is_anonymized: false,
		created_at: now
	};

	try {
		const { error } = await supabase.from('audit_logs').insert([row]);
		if (error) {
			console.error('[audit] escape-hatch write failed', error);
			return false;
		}
		return true;
	} catch (e) {
		console.error('[audit] escape-hatch write threw', e);
		return false;
	}
}

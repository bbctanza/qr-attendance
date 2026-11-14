import { supabase } from '$lib/supabase';
import type { SharedSettings } from './types';

/**
 * The shared settings the kiosk borrows from the web app (PLAN.md section 4).
 *
 * They live in one row: `system_settings` with `id = 1`, guarded by a CHECK constraint that
 * there can only ever be that one row. The kiosk **reads** it and never writes - editing stays
 * in the web app's App Settings page.
 *
 * Its SELECT policy is `TO authenticated, anon USING (true)`, so this can be loaded *before*
 * the device signs in. That matters: the organisation's name should be on the first-boot
 * sign-in screen, not a placeholder.
 *
 * Columns are read with `select('*')` and nullish fallbacks rather than being listed
 * explicitly, exactly as the web app's `loadSettings()` does. `scan_modal_enabled` and
 * `scan_modal_duration` were added after `database/template_schema.sql` was written, so they
 * are present in the live database but not in the checked-in schema - naming columns here
 * would break against either one or the other.
 */

/** Used until the row loads, and if it can't be reached. Matches the web app's own defaults. */
export const SHARED_DEFAULTS: SharedSettings = {
	siteName: 'Scan-in System',
	orgName: 'Organization Name',
	primaryColor: '#275032',
	timezone: 'Asia/Manila',
	resultDuration: 5,
	resultDetailEnabled: true
};

interface SystemSettingsRow {
	site_name?: string | null;
	qr_header_title?: string | null;
	primary_color?: string | null;
	timezone?: string | null;
	scan_modal_enabled?: boolean | null;
	scan_modal_duration?: number | null;
}

/** Returns null when the row can't be read, so the caller can keep the current values. */
export async function loadSharedSettings(): Promise<SharedSettings | null> {
	const { data, error } = await supabase
		.from('system_settings')
		.select('*')
		.eq('id', 1)
		.maybeSingle();

	if (error) {
		console.error('[settings] could not load system_settings', error);
		return null;
	}
	if (!data) {
		console.warn('[settings] no system_settings row found; using defaults');
		return null;
	}

	const row = data as SystemSettingsRow;
	return {
		siteName: row.site_name || SHARED_DEFAULTS.siteName,
		orgName: row.qr_header_title || SHARED_DEFAULTS.orgName,
		primaryColor: row.primary_color || SHARED_DEFAULTS.primaryColor,
		timezone: row.timezone || SHARED_DEFAULTS.timezone,
		resultDuration: row.scan_modal_duration ?? SHARED_DEFAULTS.resultDuration,
		resultDetailEnabled: row.scan_modal_enabled ?? SHARED_DEFAULTS.resultDetailEnabled
	};
}

/**
 * Push the shared values into the places the DOM owns.
 *
 * The web app's `applySettings()` sets `--color-primary`; this app's tokens call it
 * `--primary` (see app.css, where `@theme inline` maps one to the other), so the hex is
 * written to both.
 *
 * **Light theme only, deliberately.** The organisation's colour is a dark forest green
 * (#275032) chosen against the web app's white ground. The kiosk defaults to dark - its
 * background is near-black - and the ported standby screen renders the countdown digits as
 * `text-primary` at `text-6xl`. Forcing the brand green there puts dark green on near-black
 * at roughly 1.5:1 contrast, i.e. an unreadable countdown on the one screen that is meant to
 * be legible across a room. In dark mode the token palette's own brighter green is kept.
 */
export function applySharedSettings(shared: SharedSettings, isDark: boolean) {
	if (typeof document === 'undefined') return;

	document.title = shared.siteName;

	const root = document.documentElement;
	if (isDark) {
		root.style.removeProperty('--primary');
		root.style.removeProperty('--color-primary');
		return;
	}
	root.style.setProperty('--primary', shared.primaryColor);
	root.style.setProperty('--color-primary', shared.primaryColor);
}

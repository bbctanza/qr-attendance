import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY } from '$env/static/public';
import { sessionStorageAdapter } from '$lib/kiosk/secure-storage';

/**
 * Same Supabase project as the web app - see PLAN.md section 2. Copied from the web app's
 * src/lib/supabase.ts, with one kiosk-specific change: session persistence is explicit.
 *
 * `persistSession` + `autoRefreshToken` are what let the device come back up already signed
 * in after a restart or power cut, which is the whole point of a dedicated kiosk account.
 * The session itself goes to the OS credential store via `sessionStorageAdapter` - the
 * fast-follow promised in PLAN.md section 3, replacing the plain app-data file.
 */
const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseAnonKey = PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	console.warn('Supabase URL or key is missing. Check kiosk-rs/.env');
}

export const supabase =
	supabaseUrl && supabaseAnonKey
		? createClient(supabaseUrl, supabaseAnonKey, {
				auth: {
					persistSession: true,
					autoRefreshToken: true,
					storage: sessionStorageAdapter,
					// The kiosk session must not expire on its own - PLAN.md section 4 skips the
					// web app's session-timeout auto-logout for exactly this reason.
					detectSessionInUrl: false
				}
			})
		: createClient('https://placeholder.supabase.co', 'placeholder');

/** True when real credentials were supplied, so the UI can say so instead of failing oddly. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

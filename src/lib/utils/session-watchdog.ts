import { supabase } from '$lib/supabase';
import { toast } from 'svelte-sonner';
import { checkOwnSession, getCurrentAuthSessionId } from '$lib/utils/sessions';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Session watchdog.
 *
 * This is what makes "log out this device" mean anything. Revoking a session marks its row
 * inactive; the affected device learns about it here and signs itself out.
 *
 * Two paths, because neither alone is sufficient:
 *  - Realtime gives a near-instant kick (~1-2s) while the tab is connected.
 *  - A focus/interval re-check covers the cases Realtime cannot: the device was offline or
 *    asleep when the change landed, or WebSockets are blocked on the network.
 *
 * Deliberately cooperative: a device that never runs this code keeps its access token until it
 * expires. Hard, server-side revocation of a *single* device would need a service-role
 * credential; "log out all other devices" is already hard-enforced in revokeAllOtherSessions()
 * via signOut({ scope: 'others' }).
 */

/** How often to re-verify our own row when Realtime has nothing to say. */
const FALLBACK_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Don't re-check more than once in this window, so focus-flapping can't spam the DB. */
const MIN_CHECK_GAP_MS = 15 * 1000;

export function startSessionWatchdog(): () => void {
	let stopped = false;
	let signingOut = false;
	let lastCheck = 0;
	let channel: RealtimeChannel | null = null;
	let interval: ReturnType<typeof setInterval> | null = null;
	let authSessionId: string | null = null;

	async function enforceSignOut(reason: string) {
		if (stopped || signingOut) return;
		signingOut = true;

		console.info(`Session watchdog signing out: ${reason}`);
		toast.error('This device was signed out', {
			description: 'Your session was ended from another device.'
		});

		try {
			// Local scope only: this session is already gone server-side, and a global sign-out
			// would take down the user's other devices too.
			// No redirect here on purpose - the SIGNED_OUT handlers in the root and (protected)
			// layouts already own that navigation, and a third one would race them.
			await supabase.auth.signOut({ scope: 'local' });
		} catch (e) {
			console.error('Watchdog sign-out failed:', e);
		}
	}

	async function verify(force = false) {
		if (stopped || signingOut) return;

		const now = Date.now();
		if (!force && now - lastCheck < MIN_CHECK_GAP_MS) return;
		lastCheck = now;

		const state = await checkOwnSession();

		// 'missing' and 'unknown' are both left alone on purpose. A row can be legitimately
		// absent (registration still in flight, or GoTrue omitted the claim), and 'unknown'
		// means the check itself failed — neither is evidence of revocation, and signing out
		// on them would log people out on a flaky connection.
		if (state === 'revoked') {
			await enforceSignOut('session row marked inactive');
		}
	}

	function onVisibilityChange() {
		if (document.visibilityState === 'visible') void verify();
	}

	(async () => {
		authSessionId = await getCurrentAuthSessionId();
		if (stopped) return;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		const userId = session?.user?.id;
		if (!userId || stopped) return;

		// Scoped to this user's own rows; the SELECT policy on user_sessions enforces the same
		// restriction server-side, so the filter is for efficiency, not security.
		channel = supabase
			.channel(`user-sessions:${userId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'user_sessions',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					if (stopped || !authSessionId) return;

					// On DELETE the row lives in `old`; `new` is an empty object rather than null,
					// so `new ?? old` would silently pick the blank one and match nothing.
					const isDelete = payload.eventType === 'DELETE';
					const row = (isDelete ? payload.old : payload.new) as
						{ auth_session_id?: string | null; is_active?: boolean } | undefined;

					if (!row || row.auth_session_id !== authSessionId) return;

					if (isDelete || row.is_active === false) {
						void enforceSignOut('revocation received over realtime');
					}
				}
			)
			.subscribe();

		// Re-read the claim after a token refresh: GoTrue keeps session_id stable across
		// refreshes, but re-reading costs nothing and avoids relying on that.
		interval = setInterval(() => {
			void (async () => {
				authSessionId = await getCurrentAuthSessionId();
				await verify(true);
			})();
		}, FALLBACK_CHECK_INTERVAL_MS);

		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('online', onVisibilityChange);

		// Catch a revocation that landed while this device was closed.
		await verify(true);
	})();

	return () => {
		stopped = true;
		if (interval) clearInterval(interval);
		if (channel) void supabase.removeChannel(channel);
		document.removeEventListener('visibilitychange', onVisibilityChange);
		window.removeEventListener('online', onVisibilityChange);
	};
}

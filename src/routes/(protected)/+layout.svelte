<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { devTools } from '$lib/stores/dev';
	import ChangelogModal from '$lib/components/changelog-modal.svelte';
	import { automation } from '$lib/logic/automation';
	import { changelogStore } from '$lib/stores/changelog';
	import { CURRENT_VERSION, changelog } from '$lib/config/changelog';
	import { registerSession } from '$lib/utils/sessions';
	import { startSessionWatchdog } from '$lib/utils/session-watchdog';
	import { toast } from 'svelte-sonner';

	let { children } = $props();
	let isLoading = $state(true);
	let isChangelogOpen = $state(false);

	onMount(() => {
		let mounted = true;
		let stopWatchdog: (() => void) | null = null;

		// Check for new version and show changelog if needed
		const shouldShow = changelogStore.checkAndShowChangelog(CURRENT_VERSION);
		if (shouldShow && changelog.length > 0) {
			isChangelogOpen = true;
		}

		// Start automation engine (singleton - shared across all user sessions)
		automation.start();

		// Set up a listener for auth changes synchronously to ensure we catch everything
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event) => {
			if (event === 'SIGNED_OUT') {
				devTools.setBypassEventTimeValidation(false);
				// Don't stop the automation engine - it's shared across sessions
				goto('/');
			}
		});

		// Check the session and onboarding status
		supabase.auth
			.getSession()
			.then(async ({ data: { session } }) => {
				if (!mounted) return;
				if (!session) {
					goto('/');
				} else {
					// Track this device and watch for it being signed out elsewhere.
					// This lives here rather than in the login form so that every route to a
					// session is covered - password, magic link, recovery and token refresh.
					// Not awaited: it makes a network round-trip for IP/location and must not
					// delay first paint. The watchdog runs its own revocation check on start.
					stopWatchdog = startSessionWatchdog();
					registerSession()
						.then(async (result) => {
							if (!mounted) return;
							if (result.status === 'revoked') {
								// Signed out from another device while this one was away.
								// The SIGNED_OUT handler below owns the redirect.
								await supabase.auth.signOut({ scope: 'local' });
							}
						})
						.catch((e) => console.error('Session registration failed:', e));

					const { data: profile, error } = await supabase
						.from('profiles')
						.select('onboarding_completed, status, email, id')
						.eq('id', session.user.id)
						.single();

					if (!error && profile) {
						// A suspended account can still be holding a valid access token when
						// it is suspended, or sign in again before the token is rejected.
						// Checking here means suspension takes effect on the next navigation
						// rather than whenever the token happens to expire.
						if (profile.status === 'suspended') {
							await supabase.auth.signOut();
							toast.error('Your access has been suspended. Contact an administrator.');
							goto('/login');
							return;
						}

						// Account setup is a route of its own now, not a modal over a dashboard
						// the user can see but not use.
						if (!profile.onboarding_completed) {
							goto('/welcome');
							return;
						}
					}

					isLoading = false;
				}
			})
			.catch((e) => {
				console.error(e);
				goto('/');
			});

		return () => {
			mounted = false;
			subscription.unsubscribe();
			stopWatchdog?.();
			// Don't stop the automation engine - it's shared across all sessions
		};
	});
</script>

{#if isLoading}
	<div class="flex h-screen items-center justify-center bg-background">
		<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
	</div>
{:else}
	<ChangelogModal bind:open={isChangelogOpen} />
	{@render children()}
{/if}

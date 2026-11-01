<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import WelcomePage from '$lib/components/welcome-page.svelte';
	import { siteConfig } from '$lib/config/site';

	/**
	 * Public landing page.
	 *
	 * This used to redirect everyone to /login on mount, which meant the site's entire public
	 * face was an anonymous password prompt reached via a JavaScript bounce - the shape of a
	 * phishing kit, and a significant contributor to the Safe Browsing flag on this domain.
	 *
	 * Now only signed-in users are forwarded (to /overview, as before). Everyone else, crawlers
	 * included, gets real content describing who operates the system and how to reach them,
	 * with an explicit link to the staff sign-in.
	 */
	/**
	 * Starts false so the server-rendered HTML contains the real landing content rather than a
	 * spinner — a crawler that doesn't execute JavaScript must still see a legitimate page, which
	 * is the entire point of this change.
	 *
	 * In the browser we can tell synchronously whether a session is likely present (Supabase
	 * persists its token under an `sb-*-auth-token` key), so a signed-in user goes straight to the
	 * loading state instead of flashing the landing page before the redirect.
	 */
	function hasStoredSession() {
		if (!browser) return false;
		try {
			return Object.keys(localStorage).some(
				(k) => k.startsWith('sb-') && k.endsWith('-auth-token')
			);
		} catch {
			// Private mode or blocked storage: fall back to showing the landing page.
			return false;
		}
	}

	let isCheckingAuth = $state(hasStoredSession());

	onMount(async () => {
		// Force light mode
		document.documentElement.classList.remove('dark');

		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();

			if (session) {
				goto('/overview');
				return;
			}
		} catch (error) {
			console.error('Error checking auth:', error);
		}

		// Not signed in (or the check failed): show the landing page rather than bouncing to login.
		isCheckingAuth = false;
	});
</script>

<svelte:head>
	<title>{siteConfig.name} — {siteConfig.organization.name}</title>
	<meta name="description" content={siteConfig.organization.purpose} />
	<link rel="canonical" href="/" />
</svelte:head>

<WelcomePage isLoading={isCheckingAuth} />

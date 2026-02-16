<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import WelcomePage from '$lib/components/welcome-page.svelte';

	let isCheckingAuth = $state(true);

	onMount(async () => {
		// Force light mode
		document.documentElement.classList.remove('dark');

		try {
			const { data: { session } } = await supabase.auth.getSession();
			
			if (session) {
				// User is already logged in, redirect to overview
				goto('/overview');
			} else {
				// User is not logged in, redirect to login
				goto('/login');
			}
		} catch (error) {
			console.error('Error checking auth:', error);
			// On error, redirect to login
			goto('/login');
		}
	});
</script>

<!-- Show welcome page while checking auth -->
<WelcomePage isLoading={true} />

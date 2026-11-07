<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		// Client-side redirect to the new Attendance route
		goto('/attendance', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Redirecting... | {siteConfig.name}</title>
</svelte:head>

<div class="p-6 text-center text-muted-foreground">Redirecting to Attendance…</div>

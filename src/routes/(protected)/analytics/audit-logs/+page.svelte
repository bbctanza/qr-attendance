<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/settings/audit-logs', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Redirecting... | {siteConfig.name}</title>
</svelte:head>

<div class="flex items-center justify-center p-12">
	<p class="text-sm text-muted-foreground">Redirecting to Audit Logs...</p>
</div>

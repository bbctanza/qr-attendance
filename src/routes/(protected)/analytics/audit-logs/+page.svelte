<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/settings/audit-logs', { replaceState: true });
	});
</script>

<div class="flex items-center justify-center p-12">
	<p class="text-sm text-muted-foreground">Redirecting to Audit Logs...</p>
</div>

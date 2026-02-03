<script lang="ts">
	import { Spinner } from "$lib/components/ui/spinner";
	import { fade } from "svelte/transition";

	let { message = "Loading data..." } = $props();
</script>

<div 
	class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
	transition:fade={{ duration: 200 }}
>
	<div class="flex flex-col items-center gap-4">
		<Spinner class="size-12 text-primary" />
		{#if message}
			<p class="text-sm font-medium text-muted-foreground animate-pulse">{message}</p>
		{/if}
	</div>
</div>

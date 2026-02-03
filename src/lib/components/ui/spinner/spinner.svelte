<script lang="ts">
	import { cn } from "$lib/utils.js";
	import { Loader2 } from "@lucide/svelte";

	let { class: className, ...restProps } = $props();
</script>

<Loader2
	role="status"
	aria-label="Loading"
	class={cn("size-4 animate-spin", className)}
	{...restProps}
/>

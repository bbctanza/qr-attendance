<script lang="ts">
	// Simple description wrapper for dialogs
	let { children, class: className = undefined, ...rest } = $props();
</script>

<div class={className} {...rest}>
	{@render children()}
</div>
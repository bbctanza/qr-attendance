<script lang="ts">
	// Minimal footer wrapper for dialogs
	let { children, class: className, ...rest } = $props();
</script>

<footer class={className} {...rest}>
	{@render children()}
</footer>
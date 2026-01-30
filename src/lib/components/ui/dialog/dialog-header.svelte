<script lang="ts">
	// Minimal header wrapper for dialogs
	let { children, class: className, ...rest } = $props();
</script>

<header class={className} {...rest}>
	{@render children()}
</header>
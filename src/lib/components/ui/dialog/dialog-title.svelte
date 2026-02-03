<script lang="ts">
	let { children, class: className = undefined, ...rest } = $props();
</script>

<h3 class={className} {...rest}>
	{@render children()}
</h3>
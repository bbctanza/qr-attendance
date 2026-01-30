<script lang="ts">
	let { children, class: className, ...rest } = $props();
</script>

<h3 class={className} {...rest}>
	{@render children()}
</h3>
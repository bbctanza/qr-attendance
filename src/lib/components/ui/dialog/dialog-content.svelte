<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	let { children, ...restProps } = $props();
</script>

<DialogPrimitive.Content {...restProps}>
	{@render children()}
</DialogPrimitive.Content>
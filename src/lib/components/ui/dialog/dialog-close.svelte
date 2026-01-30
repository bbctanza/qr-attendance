<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	let { children, ...restProps } = $props();
</script>

<DialogPrimitive.Close {...restProps}>
	{@render children()}
</DialogPrimitive.Close>
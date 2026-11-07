<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { X } from '@lucide/svelte';

	let { children, ...restProps } = $props();
</script>

<DialogPrimitive.Content {...restProps}>
	{@render children()}
	<!--
		Every dialog gets this, even the ones that already have a Cancel or Close button in
		their footer - the corner X is a second, muscle-memory way out that a user reaches for
		before reading the footer at all, and its absence was inconsistent: audit-logs hand-rolled
		one just for its detail modal, every other Dialog had none.

		Positioned absolute, not sticky: every current caller's Content box is itself `fixed`,
		which is already a positioning root, so this needs no wrapper of its own. Content that
		scrolls internally (audit-logs' detail modal) scrolls the X away with it, same as the
		hand-rolled version did - matched, not fixed, since making it float is a separate call.
	-->
	<DialogPrimitive.Close
		class="absolute top-4 right-4 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity outline-none hover:bg-muted hover:opacity-100 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
	>
		<X class="h-4 w-4" />
		<span class="sr-only">Close</span>
	</DialogPrimitive.Close>
</DialogPrimitive.Content>

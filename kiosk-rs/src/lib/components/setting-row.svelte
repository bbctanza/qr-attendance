<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		description,
		control
	}: { label: string; description?: string; control?: Snippet } = $props();
</script>

<!--
	Label and description on the left, a control on the right.

	The control is `shrink-0`: a switch, slider or button must keep its size rather than being
	squeezed by a long label. That makes the slot wrong for long text - an unbreakable string
	there will overflow the row and crush the label column instead of wrapping. Stack it
	yourself when the right-hand side is a value rather than a control.
-->
<div class="flex min-h-tap items-center justify-between gap-6 py-3">
	<div class="min-w-0">
		<p class="text-base font-medium">{label}</p>
		{#if description}
			<p class="mt-0.5 text-sm leading-snug text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if control}
		<div class="flex shrink-0 items-center gap-3">{@render control()}</div>
	{/if}
</div>

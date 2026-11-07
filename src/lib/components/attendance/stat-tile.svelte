<script lang="ts">
	import type { Component } from 'svelte';

	/**
	 * One labelled number.
	 *
	 * The attendance page previously wrote this block four times - once per stat, twice over
	 * for the mobile and desktop branches - so the two copies had already drifted apart in
	 * padding and radius.
	 */
	let {
		label,
		value,
		icon,
		tone = 'text-muted-foreground'
	}: {
		label: string;
		value: string | number;
		icon: Component;
		/** Tailwind text colour for the icon only; the number stays foreground. */
		tone?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

<div class="rounded-2xl border border-border/40 bg-card p-4 shadow-sm sm:p-5">
	<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
		<Icon class="h-4 w-4 shrink-0 {tone}" />
		<span class="truncate tracking-widest uppercase">{label}</span>
	</div>
	<div class="mt-2 text-2xl font-extrabold tabular-nums">{value}</div>
</div>

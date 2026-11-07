<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { Component } from 'svelte';

	/**
	 * One headline figure.
	 *
	 * The page previously wrote each of these twice, once in the mobile tree and once in the
	 * desktop tree, so the eight cards were four cards' worth of duplicated markup.
	 *
	 * Proportional figures, not tabular-nums: equal-width digits make a large standalone
	 * number read loose. Tabular alignment is for columns of numbers, not hero values.
	 */
	let {
		label,
		value,
		icon,
		detail = null
	}: {
		label: string;
		value: string | number;
		icon: Component;
		/** Secondary line - the denominator, a caveat, a sample note. */
		detail?: string | null;
	} = $props();

	const Icon = $derived(icon);
</script>

<!--
	h-full + a centered CardContent: a no-op when this card's natural height already matches
	its siblings (every existing use, four in a row on Analytics), but load-bearing wherever
	a KpiCard sits beside something taller in a stretched grid (attendance/history's Rate
	card). Without it, a stretched Card still sizes its single child to content height, so
	the value/icon block stays pinned to the top with dead space opening up beneath it.
-->
<Card class="h-full">
	<CardContent class="flex h-full flex-col justify-center p-4 sm:p-5">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="text-2xl font-bold sm:text-3xl">{value}</div>
				<p class="mt-1 text-xs text-muted-foreground">{label}</p>
				{#if detail}
					<p class="mt-0.5 text-[11px] text-muted-foreground/80">{detail}</p>
				{/if}
			</div>
			<Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
		</div>
	</CardContent>
</Card>

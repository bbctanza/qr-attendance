<script lang="ts">
	/**
	 * A single row of count-bearing filter chips.
	 *
	 * Replaces the pattern this app had settled into: a grid of four summary tiles whose only
	 * behaviour on click was to set a filter, sitting above a pair of dropdowns that set the
	 * same filters again. The tiles cost 126px on a phone, never showed which filter was
	 * currently applied, and mostly read zero.
	 *
	 * A chip keeps the count, gains an active state, and costs 38px.
	 *
	 * Chips with a zero count are dimmed rather than hidden, so the row does not reshuffle
	 * under the user's thumb as the data changes. They stay clickable - filtering to an empty
	 * set is a legitimate way to confirm there is nothing there, and the empty state says so.
	 */
	let {
		options,
		value = $bindable('all'),
		label
	}: {
		options: { value: string; label: string; count?: number }[];
		value?: string;
		/** Names the group for screen readers, e.g. "Filter people". */
		label: string;
	} = $props();
</script>

<!--
	Horizontally scrollable rather than wrapping: a second line of chips costs as much height
	as the control itself, and the leftmost chips are the common ones. `-mx-4`/`px-4` lets the
	row bleed to the screen edge so a chip can sit half-cut as the affordance that it scrolls,
	while keeping the first and last chips off the edge.

	REQUIRES a parent with `px-4` below `md` - PageShell supplies it. The bleed has nothing to
	cancel against otherwise and widens the page by 32px, which a test caught doing exactly
	that. `filter-chips.svelte.test.ts` holds both halves of the contract.
-->
<div
	role="group"
	aria-label={label}
	class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
>
	{#each options as option (option.value)}
		{@const active = value === option.value}
		{@const empty = option.count === 0}
		<button
			type="button"
			aria-pressed={active}
			onclick={() => (value = option.value)}
			class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none
				{active
				? 'border-primary bg-primary text-primary-foreground'
				: empty
					? 'border-border/60 bg-card text-muted-foreground hover:border-border'
					: 'border-border bg-card text-foreground hover:bg-muted'}"
		>
			{option.label}
			{#if option.count !== undefined}
				<span
					class="text-[11px] font-semibold tabular-nums {active
						? 'text-primary-foreground/75'
						: 'text-muted-foreground'}"
				>
					{option.count}
				</span>
			{/if}
		</button>
	{/each}
</div>

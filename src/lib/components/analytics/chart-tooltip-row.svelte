<script lang="ts">
	/**
	 * One labelled figure inside a chart tooltip.
	 *
	 * Label left, value right, so a column of them aligns and can be read down. Values carry
	 * tabular-nums precisely because they stack vertically - the one place equal-width digits
	 * earn their keep.
	 */
	let {
		label,
		value,
		emphasis = false
	}: {
		label: string;
		value: string | number;
		/** For the figure the rest of the panel is explaining. */
		emphasis?: boolean;
	} = $props();
</script>

<div class="flex items-baseline justify-between gap-6">
	<span class="text-[11px] text-muted-foreground">{label}</span>
	<span class="text-xs tabular-nums {emphasis ? 'font-bold' : 'font-semibold'}">{value}</span>
</div>

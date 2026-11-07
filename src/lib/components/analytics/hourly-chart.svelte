<script lang="ts">
	import { Clock } from '@lucide/svelte';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { BarChart, Tooltip } from 'layerchart';
	import EmptyState from '$lib/components/common/empty-state.svelte';
	import TooltipRow from './chart-tooltip-row.svelte';
	import type { HourBucket } from '$lib/utils/statistics';

	/**
	 * When people check in, by hour of the day.
	 *
	 * One series, so one colour and no legend. Only hours with check-ins are plotted, so a
	 * congregation arriving between 7am and 9am gets three bars rather than twenty-four with
	 * twenty-one empty.
	 */
	let { buckets = [] }: { buckets: HourBucket[] } = $props();

	let total = $derived(buckets.reduce((sum, bucket) => sum + bucket.count, 0));
	let busiest = $derived(buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0));

	/** Share of the day's check-ins - the context a bare count lacks. */
	let rows = $derived(
		buckets.map((bucket) => ({
			...bucket,
			share: total > 0 ? Math.round((bucket.count / total) * 100) : 0,
			isBusiest: busiest > 0 && bucket.count === busiest
		}))
	);

	type Row = (typeof rows)[number];

	const chartConfig = {
		count: { label: 'Check-ins', color: 'var(--color-primary)' }
	} satisfies Chart.ChartConfig;
</script>

{#if buckets.length === 0}
	<EmptyState
		icon={Clock}
		title="No check-ins recorded"
		description="The distribution appears once members are scanned in."
		compact
	/>
{:else}
	<Chart.Container config={chartConfig} class="h-[220px] w-full">
		<BarChart
			data={rows}
			x="label"
			y="count"
			series={[{ key: 'count', label: 'Check-ins' }]}
			props={{
				bars: {
					class: 'fill-primary',
					// Rounded at the data end, square at the baseline.
					radius: 4,
					rounded: 'top',
					strokeWidth: 0,
					// Capped rather than filling the band: with only a few busy hours the bands are
					// wide, and a bar that fills one reads as a slab. The leftover is the gap.
					width: 24
				}
			}}
		>
			<!-- The built-in tooltip would repeat the count the bar already shows; the share of
			     the day is the part that cannot be read off the chart. -->
			{#snippet tooltip({ context }: { context: unknown })}
				<Tooltip.Root context={context as never} variant="none">
					{#snippet children({ data }: { data: Row })}
						{#if data}
							<div
								class="min-w-[10rem] rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
							>
								<p class="text-xs font-bold">{data.label}</p>
								<div class="my-2 border-t border-border/60"></div>
								<div class="space-y-1">
									<TooltipRow label="Check-ins" value={data.count} emphasis />
									<TooltipRow label="Share of day" value={`${data.share}%`} />
								</div>
								{#if data.isBusiest}
									<p class="mt-2 text-[11px] font-medium text-primary">Busiest hour</p>
								{/if}
							</div>
						{/if}
					{/snippet}
				</Tooltip.Root>
			{/snippet}
		</BarChart>
	</Chart.Container>

	<details class="mt-3 border-t pt-2">
		<summary class="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
			Show values
		</summary>
		<table class="mt-2 w-full text-xs">
			<thead class="sr-only">
				<tr>
					<th scope="col">Hour</th>
					<th scope="col">Check-ins</th>
					<th scope="col">Share of day</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.hour)}
					<tr class="border-b border-border/40 last:border-0">
						<td class="py-1 font-medium">{row.label}</td>
						<td class="py-1 pr-2 text-right font-semibold tabular-nums">{row.count}</td>
						<td class="w-12 py-1 text-right text-muted-foreground tabular-nums">{row.share}%</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
{/if}

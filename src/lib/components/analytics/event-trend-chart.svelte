<script lang="ts">
	import { CalendarRange } from '@lucide/svelte';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { LineChart, Tooltip } from 'layerchart';
	import { curveMonotoneX } from 'd3-shape';
	import EmptyState from '$lib/components/common/empty-state.svelte';
	import TooltipRow from './chart-tooltip-row.svelte';

	/**
	 * Attendance across recent events.
	 *
	 * One series, so no legend - the card title names it. The x-axis carries event dates
	 * rather than the opaque E1..E5 the page used to emit, which forced a second legend block
	 * underneath translating each code back into an event name.
	 */
	export interface TrendPoint {
		/** The event id. Two events can fall on one date, so the label is not unique. */
		id: number;
		label: string;
		name: string;
		date: string;
		attendance: number;
		absent: number;
		/** null when the event recorded only a headcount, so no rate exists. */
		rate: number | null;
	}

	let { points = [] }: { points: TrendPoint[] } = $props();

	const chartConfig = {
		attendance: { label: 'Attendance', color: 'var(--color-primary)' }
	} satisfies Chart.ChartConfig;
</script>

{#if points.length === 0}
	<EmptyState
		icon={CalendarRange}
		title="No completed events"
		description="Attendance appears here once events finish."
		compact
	/>
{:else}
	<!-- Height covers the plot and the x-axis band, so the card never grows a nested scroll. -->
	<Chart.Container config={chartConfig} class="h-[220px] w-full">
		<LineChart
			data={points}
			x="label"
			y="attendance"
			series={[{ key: 'attendance', label: 'Attendance' }]}
			points={true}
			props={{
				spline: { class: 'stroke-primary stroke-2', curve: curveMonotoneX },
				points: { class: 'fill-primary stroke-card stroke-2', r: 4 }
			}}
		>
			<!--
				A snippet rather than the built-in tooltip: the default renders one row per series,
				and a single-series line chart therefore showed nothing but the number already
				plotted. The useful detail is which event it was and how it compares to its roster.
			-->
			{#snippet tooltip({ context }: { context: unknown })}
				<Tooltip.Root context={context as never} variant="none">
					{#snippet children({ data }: { data: TrendPoint })}
						{#if data}
							<div
								class="min-w-[11rem] rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
							>
								<p class="text-xs font-bold">{data.name}</p>
								<p class="mt-0.5 text-[11px] text-muted-foreground">{data.date}</p>
								<div class="my-2 border-t border-border/60"></div>
								<div class="space-y-1">
									<TooltipRow label="Present" value={data.attendance} emphasis />
									{#if data.rate === null}
										<!-- No absences were recorded, so there is no roster to divide by. -->
										<p class="pt-0.5 text-[11px] text-muted-foreground">Headcount only — no rate</p>
									{:else}
										<TooltipRow label="Absent" value={data.absent} />
										<TooltipRow label="Rate" value={`${data.rate}%`} />
									{/if}
								</div>
							</div>
						{/if}
					{/snippet}
				</Tooltip.Root>
			{/snippet}
		</LineChart>
	</Chart.Container>

	<!-- Values are reachable without hovering; the tooltip enhances rather than gates. -->
	<details class="mt-3 border-t pt-2">
		<summary class="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
			Show values
		</summary>
		<table class="mt-2 w-full text-xs">
			<thead class="sr-only">
				<tr>
					<th scope="col">Event</th>
					<th scope="col">Date</th>
					<th scope="col">Attended</th>
					<th scope="col">Rate</th>
				</tr>
			</thead>
			<tbody>
				{#each points as point (point.id)}
					<tr class="border-b border-border/40 last:border-0">
						<td class="truncate py-1 pr-2 font-medium" title={point.name}>{point.name}</td>
						<td class="py-1 pr-2 text-muted-foreground">{point.date}</td>
						<td class="py-1 pr-2 text-right font-semibold tabular-nums">{point.attendance}</td>
						<td class="w-12 py-1 text-right text-muted-foreground tabular-nums">
							{point.rate === null ? '—' : `${point.rate}%`}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
{/if}

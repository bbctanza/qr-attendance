<script lang="ts">
	import { Users } from '@lucide/svelte';
	import EmptyState from '$lib/components/common/empty-state.svelte';
	import type { GroupParticipation } from '$lib/utils/statistics';

	/**
	 * Each group's participation rate, as ranked horizontal bars.
	 *
	 * Replaces a hand-rolled SVG radar that plotted each group's share of total attendance
	 * while discarding the member count it had already fetched. A share makes the largest
	 * group look best by construction; a rate is comparable across group sizes.
	 *
	 * Plain markup rather than a charting library on purpose: there are no axes, the labels
	 * are the group names, every value is directly labelled, and it reflows at 400px. A chart
	 * component would add a tooltip layer to reveal numbers that are already on screen.
	 *
	 * One colour for every bar. Shading bars by their own value would double-encode length as
	 * hue and spend the only free channel on information the bar already carries.
	 */
	let {
		groups = [],
		eventCountLabel = null
	}: {
		groups: GroupParticipation[];
		/** e.g. "across 4 events" - clarifies what the rate is out of. */
		eventCountLabel?: string | null;
	} = $props();
</script>

{#if groups.length === 0}
	<EmptyState
		icon={Users}
		title="No groups yet"
		description="Participation by group appears once members are assigned to groups."
		compact
	/>
{:else}
	{#if eventCountLabel}
		<p class="mb-3 text-[11px] text-muted-foreground">{eventCountLabel}</p>
	{/if}

	<!-- A table, because that is what this is: one row per group, values read across. -->
	<table class="w-full border-separate border-spacing-y-0.5 text-sm">
		<caption class="sr-only">Attendance rate by group, lowest first</caption>
		<thead class="sr-only">
			<tr>
				<th scope="col">Group</th>
				<th scope="col">Attendance rate</th>
				<th scope="col">Attendances out of possible</th>
			</tr>
		</thead>
		<tbody>
			{#each groups as group (group.id)}
				<tr>
					<th
						scope="row"
						class="w-[38%] truncate py-1 pr-3 text-left text-xs font-medium text-muted-foreground"
						title={group.name}
					>
						{group.name}
					</th>
					<td class="py-1">
						<!-- Track and fill: 10px tall, rounded at the data end, square at the baseline. -->
						<div class="h-2.5 w-full overflow-hidden rounded-sm bg-muted">
							<div
								class="h-full rounded-r-[4px] bg-primary transition-[width] duration-500"
								style="width: {Math.max(group.rate, group.rate > 0 ? 2 : 0)}%"
							></div>
						</div>
					</td>
					<td class="w-14 py-1 pl-3 text-right text-xs font-semibold tabular-nums">
						{group.rate}%
					</td>
					<td class="w-20 py-1 pl-2 text-right text-[11px] text-muted-foreground tabular-nums">
						{group.present}/{group.members}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<script lang="ts">
	import { ScanLine } from '@lucide/svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatTimeSync } from '$lib/utils/time';
	import PersonRow from './person-row.svelte';
	import EmptyState from '$lib/components/common/empty-state.svelte';
	import type { RosterEntry } from '$lib/api/attendance';

	/**
	 * Check-ins, newest first.
	 *
	 * Times are formatted with formatTimeSync rather than formatLocalTime: the async variant
	 * awaits getUserTimezone(), which falls back to a system_settings query, so the old
	 * `await`-per-row mapping could put one network round trip behind every line in the list.
	 */
	let {
		scans = [],
		isLoading = false,
		emptyTitle = 'No scans yet',
		emptyDescription = null
	}: {
		scans: (RosterEntry & { scan_id?: string })[];
		isLoading?: boolean;
		emptyTitle?: string;
		emptyDescription?: string | null;
	} = $props();
</script>

{#if isLoading}
	<div class="space-y-2 p-2">
		{#each ['a', 'b', 'c', 'd', 'e', 'f'] as key (key)}
			<div class="flex items-center gap-3 p-2">
				<Skeleton class="h-9 w-9 rounded-full" />
				<div class="flex-1 space-y-1.5">
					<Skeleton class="h-3.5 w-32" />
					<Skeleton class="h-3 w-20" />
				</div>
				<Skeleton class="h-3 w-12" />
			</div>
		{/each}
	</div>
{:else if scans.length === 0}
	<div class="p-4">
		<EmptyState icon={ScanLine} title={emptyTitle} description={emptyDescription} compact />
	</div>
{:else}
	<div class="space-y-1 p-2">
		{#each scans as scan (scan.scan_id ?? scan.member_id)}
			<PersonRow firstName={scan.first_name} lastName={scan.last_name} careGroup={scan.care_group}>
				{#snippet trailing()}
					<div class="flex items-center gap-2">
						<span class="text-[11px] font-semibold text-muted-foreground tabular-nums">
							{scan.scan_datetime ? formatTimeSync(new Date(scan.scan_datetime)) : '—'}
						</span>
						<span class="h-2 w-2 rounded-full bg-(--stat-success)"></span>
					</div>
				{/snippet}
			</PersonRow>
		{/each}
	</div>
{/if}

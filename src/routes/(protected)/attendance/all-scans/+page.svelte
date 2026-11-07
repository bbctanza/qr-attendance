<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardHeader } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { AlertTriangle, Calendar, ChevronLeft, Search } from '@lucide/svelte';

	import ScanList from '$lib/components/attendance/scan-list.svelte';
	import EmptyState from '$lib/components/common/empty-state.svelte';

	import { attendanceApi, type RosterEntry } from '$lib/api/attendance';
	import { showErrorToast } from '$lib/utils/errorHandler';

	/**
	 * Every scan for the session in progress.
	 *
	 * This page was always scoped to the ongoing event while the "Recent Scans" panel it
	 * expands from was not - that panel listed the newest scans across all events, so the two
	 * showed different things. The panel is scoped now, and the event name is stated in the
	 * header here so the relationship is visible rather than assumed.
	 */

	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let eventName = $state<string | null>(null);
	let scans = $state<(RosterEntry & { scan_id: string })[]>([]);
	let searchQuery = $state('');

	async function load() {
		loadError = null;
		try {
			const ongoing = await attendanceApi.getOngoingEvents();
			const event = ongoing[0];
			if (!event) {
				eventName = null;
				scans = [];
				return;
			}
			eventName = event.event_name;
			// No limit here - this is the "all" view, unlike the capped panel it expands from.
			scans = await attendanceApi.getRecentScans(event.event_id, 1000);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Could not load scans.';
			showErrorToast(error, 'Scans unavailable');
		}
	}

	onMount(() => {
		load().finally(() => (isLoading = false));
	});

	let filtered = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return scans;
		return scans.filter(
			(scan) =>
				`${scan.first_name} ${scan.last_name}`.toLowerCase().includes(q) ||
				scan.care_group.toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>All Scans | {siteConfig.name}</title>
</svelte:head>

<div class="flex w-full flex-col gap-5 p-4 md:p-6 lg:p-8">
	<div class="flex items-start gap-2 sm:gap-3">
		<button
			onclick={() => goto('/attendance')}
			class="mt-0.5 shrink-0 rounded-lg p-2 transition hover:bg-muted"
			aria-label="Back to attendance"
		>
			<ChevronLeft class="h-5 w-5" />
		</button>
		<div class="min-w-0">
			<h1 class="text-xl font-bold md:text-2xl">All Scans</h1>
			<p class="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
				{#if isLoading}
					Loading…
				{:else if eventName}
					Every check-in for {eventName}
				{:else}
					No session in progress
				{/if}
			</p>
		</div>
	</div>

	{#if isLoading}
		<Card>
			<div class="space-y-2 p-4">
				{#each ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as key (key)}
					<div class="flex items-center gap-3 p-2">
						<Skeleton class="h-9 w-9 rounded-full" />
						<div class="flex-1 space-y-1.5">
							<Skeleton class="h-3.5 w-40" />
							<Skeleton class="h-3 w-24" />
						</div>
						<Skeleton class="h-3 w-12" />
					</div>
				{/each}
			</div>
		</Card>
	{:else if loadError}
		<EmptyState
			icon={AlertTriangle}
			tone="error"
			title="Scans could not be loaded"
			description={loadError}
			onRetry={() => {
				isLoading = true;
				load().finally(() => (isLoading = false));
			}}
		/>
	{:else if !eventName}
		<EmptyState
			icon={Calendar}
			title="No live session"
			description="This page lists check-ins for the event in progress. Start one from the Events page."
			actionLabel="Go to Events"
			onAction={() => goto('/events')}
		/>
	{:else}
		<Card class="overflow-hidden">
			<CardHeader class="gap-3 px-4 py-3">
				<div class="relative">
					<Search
						class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						placeholder="Search by name or group..."
						class="pl-10"
						bind:value={searchQuery}
					/>
				</div>
				<p class="text-[11px] text-muted-foreground tabular-nums">
					{#if searchQuery.trim()}
						{filtered.length} of {scans.length} scans
					{:else}
						{scans.length} {scans.length === 1 ? 'scan' : 'scans'}
					{/if}
				</p>
			</CardHeader>
			<div class="border-t">
				<ScanList
					scans={filtered}
					emptyTitle={searchQuery.trim() ? 'No matches' : 'No scans yet'}
					emptyDescription={searchQuery.trim()
						? 'Try a different name or group.'
						: 'Check-ins appear here as they are scanned.'}
				/>
			</div>
		</Card>
	{/if}
</div>

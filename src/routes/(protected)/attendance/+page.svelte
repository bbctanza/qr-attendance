<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { siteConfig } from '$lib/config/site';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardHeader } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		AlertTriangle,
		Calendar,
		CheckCircle2,
		ArrowRight,
		QrCode,
		ScanLine,
		TrendingUp,
		Users
	} from '@lucide/svelte';

	import LiveSessionCard from '$lib/components/attendance/live-session-card.svelte';
	import ParticipationRing from '$lib/components/attendance/participation-ring.svelte';
	import StatTile from '$lib/components/attendance/stat-tile.svelte';
	import ScanList from '$lib/components/attendance/scan-list.svelte';
	import EmptyState from '$lib/components/common/empty-state.svelte';
	import PageShell from '$lib/components/page-shell.svelte';

	import {
		attendanceApi,
		summariseAttendance,
		type AttendanceSummaryRow,
		type RosterEntry
	} from '$lib/api/attendance';
	import { showErrorToast } from '$lib/utils/errorHandler';
	import { formatTimeRange, formatTimeSync, parseEventDate } from '$lib/utils/time';
	import type { AttendanceEvent } from '$lib/types';

	/**
	 * Live attendance.
	 *
	 * Rewritten for three reasons beyond the layout:
	 *
	 *  - It is actually live. The page announced "Live Updates" behind a pulsing dot while
	 *    fetching once in onMount and never again, so during a service every number was
	 *    frozen at whatever it was when the page opened. It now subscribes to the ongoing
	 *    event's scans and revalidates when the tab regains focus.
	 *
	 *  - Scans are scoped to the event. The list showed the newest twenty scans across all
	 *    events, so a live session could display check-ins from a different one - and
	 *    disagree with /attendance/all-scans, which was always scoped.
	 *
	 *  - Failures look like failures. Every query discarded its `error`, so a broken
	 *    connection rendered the same "No Live Session" card as a quiet Sunday.
	 *
	 * The mobile and desktop trees are also no longer separate copies; see
	 * $lib/components/attendance.
	 */

	interface LiveEvent {
		id: number;
		name: string;
		date: string;
		time: string;
		place: string;
	}

	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	let liveEvents = $state<LiveEvent[]>([]);
	let selectedEventId = $state<number | null>(null);
	let stats = $state({ present: 0, expected: 0 });
	let recentScans = $state<(RosterEntry & { scan_id: string })[]>([]);
	let recentSessions = $state<AttendanceSummaryRow[]>([]);
	let lastUpdated = $state<Date | null>(null);
	let isRefreshing = $state(false);
	let sessionsError = $state<string | null>(null);
	let isLoadingSessions = $state(true);

	let selectedEvent = $derived(liveEvents.find((e) => e.id === selectedEventId) ?? null);

	/** Trailing window for "Recent Sessions". Wide enough to stay populated, bounded so the
	 *  summary query does not grow with the archive. */
	const RECENT_WINDOW_DAYS = 120;

	function isoDate(d: Date) {
		return d.toISOString().slice(0, 10);
	}

	async function describeEvent(event: AttendanceEvent): Promise<LiveEvent> {
		const metadata = (event.metadata ?? {}) as { location?: string };
		return {
			id: event.event_id,
			name: event.event_name,
			date: event.event_date,
			time: await formatTimeRange(event.start_datetime, event.end_datetime),
			place: metadata.location || 'Main Sanctuary'
		};
	}

	/**
	 * The live session - the thing this page exists for.
	 *
	 * Deliberately independent of the Recent Sessions list below it. Loading both together
	 * meant a slow or failing history summary took down the live view with it, which is
	 * exactly backwards: during a service the check-in count matters and the archive does not.
	 */
	async function load() {
		loadError = null;
		try {
			const ongoing = await attendanceApi.getOngoingEvents();
			liveEvents = await Promise.all(ongoing.map(describeEvent));

			// Keep the operator's choice across a refresh unless that event has ended.
			if (!liveEvents.some((e) => e.id === selectedEventId)) {
				selectedEventId = liveEvents[0]?.id ?? null;
			}

			await loadLive();
		} catch (error) {
			loadError =
				error instanceof Error ? error.message : 'Could not load attendance for this session.';
			showErrorToast(error, 'Attendance unavailable');
		}
	}

	/** Secondary. Degrades to a message in its own section instead of failing the page. */
	async function loadRecentSessions() {
		sessionsError = null;
		isLoadingSessions = true;
		try {
			recentSessions = await attendanceApi.getAttendanceSummary(
				isoDate(new Date(Date.now() - RECENT_WINDOW_DAYS * 86400000)),
				isoDate(new Date())
			);
		} catch (error) {
			sessionsError = error instanceof Error ? error.message : 'Could not load recent sessions.';
			console.error('[attendance] recent sessions unavailable', error);
		} finally {
			isLoadingSessions = false;
		}
	}

	/** Just the numbers for the selected event - what realtime and focus both trigger. */
	async function loadLive() {
		if (selectedEventId === null) {
			stats = { present: 0, expected: 0 };
			recentScans = [];
			return;
		}

		const eventId = selectedEventId;
		const [live, scans] = await Promise.all([
			attendanceApi.getLiveStats(eventId),
			attendanceApi.getRecentScans(eventId, 20)
		]);

		// A slow response for an event the operator has since switched away from must not
		// overwrite the current one.
		if (eventId !== selectedEventId) return;

		stats = live;
		recentScans = scans;
		lastUpdated = new Date();
	}

	/** Used by realtime, focus and the refresh button; failures here are non-fatal. */
	async function revalidate() {
		if (selectedEventId === null) return;
		isRefreshing = true;
		try {
			await loadLive();
		} catch (error) {
			showErrorToast(error, 'Could not refresh the live count');
		} finally {
			isRefreshing = false;
		}
	}

	function selectEvent(eventId: number) {
		if (eventId === selectedEventId) return;
		selectedEventId = eventId;
		void revalidate();
	}

	onMount(() => {
		// Realtime can be silent - the publication may not be enabled on a given project - so
		// the subscription is paired with a focus revalidate, the same belt-and-braces approach
		// session-watchdog.ts takes for the same reason. Registered before the first load so an
		// unmount during that load cannot leave it attached.
		const onVisible = () => {
			if (document.visibilityState === 'visible') void revalidate();
		};
		document.addEventListener('visibilitychange', onVisible);

		load().finally(() => (isLoading = false));
		void loadRecentSessions();

		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	// Re-subscribes when the operator switches events; the returned disposer closes the
	// previous channel, so only the visible event is ever watched.
	$effect(() => {
		const eventId = selectedEventId;
		if (eventId === null) return;
		return attendanceApi.subscribeToEventScans(eventId, () => void revalidate());
	});

	function sessionRate(row: AttendanceSummaryRow): number | null {
		if (!row.records_absents) return null;
		const total = row.present_count + row.absent_count;
		return total > 0 ? Math.round((row.present_count / total) * 100) : 0;
	}

	/** The cap the card list and the mobile teaser both observe, so the count in the
	 *  teaser matches what is actually visible below it. */
	const VISIBLE_SESSIONS = 8;
	let visibleSessions = $derived(recentSessions.slice(0, VISIBLE_SESSIONS));

	/**
	 * Mobile-only "Recent" teaser, reusing the same summary math History already computes
	 * rather than re-deriving it. Labelled "Recent", not "This Month": RECENT_WINDOW_DAYS is
	 * a trailing 120-day window, not a calendar month, and the mockup's "This Month" would
	 * have been a false label for what this data actually is.
	 */
	let recentTotals = $derived(summariseAttendance(recentSessions));
</script>

<svelte:head>
	<title>Attendance | {siteConfig.name}</title>
</svelte:head>

<!--
	No `backTo`: unlike /attendance/history, this page is not a settings child - it is a
	top-level destination reached from the bottom nav, same standing as Overview or Members,
	and its breadcrumb entry has no parent for the same reason. No description either: the
	page is a live dashboard, not a settings area, and "Attendance" needs no further gloss.
-->
<PageShell
	title="Attendance"
	{isLoading}
	error={loadError}
	onRetry={() => {
		isLoading = true;
		load().finally(() => (isLoading = false));
	}}
>
	{#snippet actions()}
		<!--
			PageShell's own actions slot, not a custom row below it: this is what actually puts
			the button on the same line as the title at sm and up, which a separate div below
			PageShell never could - that div started its own new row regardless of width.

			`hidden sm:flex` on the button, not on this wrapper: the bottom nav already carries
			a scan FAB on every page, so this would be a second way to reach the same
			destination on a phone. The cost is a small (~12px) gap below the title on mobile,
			where both the title (hidden below md) and this button (hidden below sm) render
			nothing - a fixed amount, not worth a bespoke collapse rule for what's already a
			minor trade next to the alternative of two visible "scan" affordances stacked on
			top of each other.
		-->
		<Button size="sm" class="hidden gap-2 font-bold sm:flex" onclick={() => goto('/scan')}>
			<QrCode class="h-4 w-4" />
			{selectedEvent ? 'Scanner' : 'Open Scanner'}
		</Button>
	{/snippet}

	{#snippet skeleton()}
		<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<div class="space-y-5">
				<Skeleton class="h-32 w-full rounded-2xl" />
				<Skeleton class="h-48 w-full rounded-2xl" />
				<div class="grid grid-cols-2 gap-4">
					<Skeleton class="h-24 rounded-2xl" />
					<Skeleton class="h-24 rounded-2xl" />
				</div>
			</div>
			<Skeleton class="h-96 w-full rounded-2xl" />
		</div>
	{/snippet}

	{#if selectedEvent}
		<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<!-- Live session -->
			<div class="space-y-5">
				<!-- More than one event can legitimately run at once; the old page took
				     .limit(1) and silently hid the rest. -->
				{#if liveEvents.length > 1}
					<div
						role="tablist"
						aria-label="Live sessions"
						class="flex flex-wrap gap-2 rounded-2xl border border-border/40 bg-card/40 p-1.5"
					>
						{#each liveEvents as event (event.id)}
							<button
								role="tab"
								aria-selected={event.id === selectedEventId}
								class="rounded-xl px-3 py-1.5 text-xs font-bold transition {event.id ===
								selectedEventId
									? 'bg-primary text-primary-foreground shadow-sm'
									: 'text-muted-foreground hover:bg-muted/50'}"
								onclick={() => selectEvent(event.id)}
							>
								{event.name}
							</button>
						{/each}
					</div>
				{/if}

				<LiveSessionCard
					name={selectedEvent.name}
					date={selectedEvent.date}
					time={selectedEvent.time}
					place={selectedEvent.place}
				/>

				<div class="rounded-2xl border border-border/40 bg-card p-4 shadow-sm sm:p-6">
					<div class="flex items-start justify-between gap-4">
						<div>
							<div class="flex items-center gap-2 text-sm font-medium">
								<TrendingUp class="h-4 w-4" />
								Session Progress
							</div>
							<div class="mt-1 text-xs text-muted-foreground">
								{#if lastUpdated}
									Updated {formatTimeSync(lastUpdated)}{isRefreshing ? ' · refreshing…' : ''}
								{:else}
									Live updates
								{/if}
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							class="h-8 text-xs"
							disabled={isRefreshing}
							onclick={revalidate}
						>
							Refresh
						</Button>
					</div>

					<div class="mt-4 flex items-center gap-4 sm:gap-6">
						<div class="w-28 shrink-0 sm:w-40">
							<ParticipationRing present={stats.present} expected={stats.expected} />
						</div>
						<div class="min-w-0 flex-1">
							<div class="text-xs tracking-widest text-muted-foreground uppercase">
								Participation
							</div>
							<div class="mt-1 text-2xl font-bold text-primary sm:text-3xl">
								{stats.expected > 0 ? Math.round((stats.present / stats.expected) * 100) : 0}%
							</div>
							<div class="mt-2 text-xs text-muted-foreground">
								{stats.present} / {stats.expected} checked in
							</div>
						</div>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3 sm:gap-4">
					<StatTile
						label="Checked In"
						value={stats.present}
						icon={CheckCircle2}
						tone="text-(--stat-success)"
					/>
					<StatTile label="Expected" value={stats.expected} icon={Users} tone="text-primary" />
				</div>
			</div>

			<!-- Scans. Only rendered live: idle has nothing to scan, so a second empty panel
			     here would recreate the exact redundancy ("nothing is happening", said twice)
			     this redesign was meant to remove. -->
			<Card class="flex flex-col overflow-hidden lg:sticky lg:top-6">
				<CardHeader class="gap-1 px-4 py-3">
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-2 font-bold">
							<ScanLine class="h-4 w-4" />
							Recent Scans
						</div>
						<Button
							variant="ghost"
							size="sm"
							class="h-auto gap-1 p-0 text-xs font-bold text-primary"
							onclick={() => goto('/attendance/all-scans')}
						>
							View all
							<ArrowRight class="h-3 w-3" />
						</Button>
					</div>
					<p class="truncate text-[11px] text-muted-foreground">
						{selectedEvent.name}
					</p>
				</CardHeader>

				<div class="max-h-[28rem] flex-1 overflow-y-auto border-t">
					<ScanList
						scans={recentScans}
						emptyTitle="No scans yet"
						emptyDescription="Check-ins appear here as they are scanned."
					/>
				</div>
			</Card>
		</div>
	{:else}
		<!--
			Idle status. Desktop/tablet gets one honest line, not the dashed panel this used to
			be - the panel said the same thing a second empty panel beside it also said.

			Mobile gets more than a shrunk copy of that line: a tappable card plus the Recent
			teaser below. Dropping the page-level Scanner button here (the FAB covers it) would
			otherwise have left the phone with nothing to interact with at all, which read as
			an afterthought rather than a screen designed for the device it's on.
		-->
		<div
			class="hidden items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm sm:flex"
		>
			<span class="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"></span>
			<span class="text-muted-foreground"
				>No live session - the roster below is from the last time one ran.</span
			>
			<Button
				variant="link"
				size="sm"
				class="ml-auto h-auto gap-1 p-0 font-bold"
				onclick={() => goto('/events')}
			>
				Go to Events
				<ArrowRight class="h-3 w-3" />
			</Button>
		</div>

		<div class="flex flex-col gap-4 sm:hidden">
			<div class="flex items-center gap-3 rounded-2xl border bg-muted/40 p-3.5">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card shadow-xs"
				>
					<Calendar class="h-[18px] w-[18px] text-muted-foreground" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="text-sm font-bold">No live session</div>
					<div class="text-xs text-muted-foreground">Tap the scan button below to start one.</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					class="h-8 shrink-0 text-xs font-bold"
					onclick={() => goto('/events')}
				>
					Events
				</Button>
			</div>

			<!--
				A reason to open this page while idle: the same figures History computes,
				condensed to a glance. A teaser, not a second dashboard - "Recent" is the honest
				label for a 120-day trailing window, not "This Month".
			-->
			{#if !isLoadingSessions && recentSessions.length > 0}
				<div>
					<div class="mb-2 flex items-center justify-between">
						<span class="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
							Recent
						</span>
						<a href="/attendance/history" class="text-xs font-bold text-primary">
							Full history →
						</a>
					</div>
					<div class="grid grid-cols-3 gap-2">
						<div class="rounded-xl border bg-card px-2 py-2.5 text-center">
							<div class="text-lg font-extrabold text-primary">
								{recentTotals.tracked.length > 0 ? `${recentTotals.attendanceRate}%` : '—'}
							</div>
							<div class="text-[10px] text-muted-foreground">Rate</div>
						</div>
						<div class="rounded-xl border bg-card px-2 py-2.5 text-center">
							<div class="text-lg font-extrabold">{recentSessions.length}</div>
							<div class="text-[10px] text-muted-foreground">Events</div>
						</div>
						<div class="rounded-xl border bg-card px-2 py-2.5 text-center">
							<div class="text-lg font-extrabold">{recentTotals.averageSize}</div>
							<div class="text-[10px] text-muted-foreground">Avg.</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Recent sessions. A list, not a card grid: a bordered row per session with a status-
	     coloured edge (tracked rate vs. headcount-only), date/title left, count right - the
	     same row language DataTable uses elsewhere, instead of cards that wrapped into more
	     rows of themselves past four and read slower than a list at this density. -->
	<div class="space-y-3">
		<div class="flex items-center justify-between border-b pb-2">
			<h3 class="text-lg font-bold tracking-tight">Recent Sessions</h3>
			<a href="/attendance/history" class="text-sm font-bold text-primary hover:underline">
				View history
			</a>
		</div>

		{#if isLoadingSessions}
			<div class="space-y-2">
				{#each ['a', 'b', 'c', 'd'] as key (key)}
					<Skeleton class="h-16 w-full rounded-xl" />
				{/each}
			</div>
		{:else if sessionsError}
			<!-- Scoped to this section: the live session above stays usable. -->
			<EmptyState
				icon={AlertTriangle}
				tone="error"
				title="Recent sessions could not be loaded"
				description={sessionsError}
				onRetry={loadRecentSessions}
				compact
			/>
		{:else if recentSessions.length === 0}
			<EmptyState
				icon={Calendar}
				title="No completed sessions yet"
				description="Finished events and their attendance appear here."
				compact
			/>
		{:else}
			<div class="overflow-hidden rounded-xl border">
				{#each visibleSessions as session, i (session.event_id)}
					{@const rate = sessionRate(session)}
					<button
						type="button"
						class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50 {i >
						0
							? 'border-t'
							: ''}"
						onclick={() => goto(`/attendance/history?event=${session.event_id}`)}
					>
						<span
							class="h-8 w-1 shrink-0 rounded-full {rate === null
								? 'bg-border'
								: 'bg-primary'}"
						></span>
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-bold">{session.event_name}</div>
							<div class="text-xs text-muted-foreground">
								{parseEventDate(session.event_date).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
								· {rate === null ? 'Headcount only' : `${rate}% of ${session.present_count + session.absent_count}`}
							</div>
						</div>
						<span class="shrink-0 text-base font-extrabold tabular-nums">
							{session.present_count}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</PageShell>

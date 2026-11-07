<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import PageShell from '$lib/components/page-shell.svelte';
	import { onMount } from 'svelte';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription
	} from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Select from '$lib/components/ui/select';
	import { CheckCircle2, Clock, TrendingUp, Users } from '@lucide/svelte';

	import KpiCard from '$lib/components/common/kpi-card.svelte';
	import EventTrendChart from '$lib/components/analytics/event-trend-chart.svelte';
	import GroupParticipation from '$lib/components/analytics/group-participation.svelte';
	import HourlyChart from '$lib/components/analytics/hourly-chart.svelte';

	import { analyticsApi } from '$lib/api/analytics';
	import { summariseAttendance, type AttendanceSummaryRow } from '$lib/api/attendance';
	import {
		circularMeanTime,
		formatClockTime,
		groupParticipation,
		hourHistogram,
		type GroupParticipation as GroupRow,
		type HourBucket
	} from '$lib/utils/statistics';
	import { getConfiguredTimezone, parseEventDate } from '$lib/utils/time';
	import { showErrorToast } from '$lib/utils/errorHandler';

	/**
	 * Analytics.
	 *
	 * Rewritten because every figure here was derived from scratch and several were wrong:
	 *
	 *  - The attendance rate divided by `completedEventCount x memberCount`, which ignored
	 *    record_absents and applied today's member count to historical events. It now goes
	 *    through the same summariseAttendance() the history page uses, so the two agree by
	 *    construction rather than by coincidence.
	 *
	 *  - The group chart fetched each group's member count and then discarded it, plotting
	 *    share of total attendance instead - which makes the largest group look best whatever
	 *    its turnout.
	 *
	 *  - Average check-in time was an arithmetic mean of minutes-past-midnight, so 23:50 and
	 *    00:10 averaged to noon. Services here are stored running 23:30 to 03:00, so this was
	 *    live, not theoretical.
	 *
	 *  - The timezone was hardcoded to Asia/Manila rather than read from settings.
	 *
	 * The mobile and desktop trees are also no longer separate copies.
	 */

	const WINDOW_DAYS = 31;

	interface EventOption {
		id: string;
		name: string;
		date: string;
	}

	let isLoading = $state(true);
	let isRefreshing = $state(false);
	let loadError = $state<string | null>(null);

	let eventsList = $state<EventOption[]>([]);
	let selectedEventId = $state<string>('all');

	let summary = $state<AttendanceSummaryRow[]>([]);
	let groups = $state<GroupRow[]>([]);
	let hourly = $state<HourBucket[]>([]);
	let memberCount = $state(0);
	let averageCheckIn = $state('--:--');

	let selectedEvent = $derived(eventsList.find((e) => e.id === selectedEventId) ?? null);
	let selectedLabel = $derived(selectedEvent ? selectedEvent.name : 'Last month');

	// The same partition the history page uses: events that recorded absences have an expected
	// total and can carry a rate; headcount-only events contribute attendance but no rate.
	let totals = $derived(summariseAttendance(summary));

	let trendPoints = $derived(
		[...summary]
			.slice(0, 6)
			.reverse()
			.map((row) => {
				const expected = row.present_count + row.absent_count;
				return {
					id: row.event_id,
					label: parseEventDate(row.event_date).toLocaleDateString(undefined, {
						month: 'short',
						day: 'numeric'
					}),
					name: row.event_name,
					date: parseEventDate(row.event_date).toLocaleDateString(undefined, {
						weekday: 'short',
						month: 'short',
						day: 'numeric',
						year: 'numeric'
					}),
					attendance: row.present_count,
					absent: row.absent_count,
					// Headcount-only events have no roster to divide by, so they carry no rate -
					// the same partition summariseAttendance() applies to the headline figure.
					rate:
						row.records_absents && expected > 0
							? Math.round((row.present_count / expected) * 100)
							: null
				};
			})
	);

	let eventCountLabel = $derived(
		selectedEvent
			? 'For this event'
			: `Across ${summary.length} ${summary.length === 1 ? 'event' : 'events'} in the last month`
	);

	function isoDate(date: Date) {
		return date.toISOString().slice(0, 10);
	}

	function windowBounds(): { from: string; to: string } {
		if (selectedEvent) return { from: selectedEvent.date, to: selectedEvent.date };
		return {
			from: isoDate(new Date(Date.now() - WINDOW_DAYS * 86400000)),
			to: isoDate(new Date())
		};
	}

	async function load() {
		loadError = null;
		const { from, to } = windowBounds();
		const eventId = selectedEvent ? Number(selectedEvent.id) : undefined;

		try {
			const timeZone = getConfiguredTimezone();
			const [summaryRows, groupRows, buckets, members] = await Promise.all([
				analyticsApi.getSummary(from, to),
				analyticsApi.getGroupAttendance(from, to, eventId),
				analyticsApi.getCheckInDistribution(from, to, timeZone, eventId),
				analyticsApi.getMemberCount()
			]);

			// A single event is fetched by its own date, which can return siblings sharing it.
			summary =
				eventId === undefined ? summaryRows : summaryRows.filter((r) => r.event_id === eventId);

			groups = groupParticipation(groupRows);
			memberCount = members;

			hourly = hourHistogram(buckets);

			const use12Hour =
				typeof localStorage !== 'undefined' && localStorage.getItem('time_format') === '12h';
			averageCheckIn = formatClockTime(circularMeanTime(buckets), use12Hour);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Could not load analytics.';
			showErrorToast(error, 'Analytics unavailable');
		}
	}

	async function handleEventChange(value: string) {
		selectedEventId = value;
		// Held at reduced opacity rather than replaced by skeletons: swapping the whole page
		// out on every selector change is a layout jump for data that is about to look similar.
		isRefreshing = true;
		try {
			await load();
		} finally {
			isRefreshing = false;
		}
	}

	onMount(async () => {
		try {
			eventsList = (await analyticsApi.getCompletedEvents()).map((row) => ({
				id: String(row.event_id),
				name: row.event_name as string,
				date: row.event_date as string
			}));
			await load();
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Could not load analytics.';
			showErrorToast(error, 'Analytics unavailable');
		} finally {
			isLoading = false;
		}
	});

	function formatEventDate(dateStr: string): string {
		if (!dateStr) return '';
		return parseEventDate(dateStr).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Analytics | {siteConfig.name}</title>
</svelte:head>

<PageShell
	title="Analytics"
	description="Attendance figures for {selectedLabel.toLowerCase()}."
	backTo="/settings"
	{isLoading}
	error={loadError}
	onRetry={() => {
		isLoading = true;
		load().finally(() => (isLoading = false));
	}}
>
	{#snippet actions()}
		<!-- One filter row above everything it scopes. -->
		<div class="w-44 sm:w-56">
			<Select.Root type="single" value={selectedEventId} onValueChange={handleEventChange}>
				<Select.Trigger size="sm" class="h-9 w-full text-xs" aria-label="Period or event">
					{selectedLabel}
				</Select.Trigger>
				<Select.Content class="max-h-[280px]">
					<Select.Item value="all" label="Last month">Last month</Select.Item>
					{#each eventsList as event (event.id)}
						<Select.Item value={event.id} label={event.name}>
							<div class="flex flex-col">
								<span class="font-medium">{event.name}</span>
								<span class="text-xs text-muted-foreground">{formatEventDate(event.date)}</span>
							</div>
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{/snippet}

	{#snippet skeleton()}
		<div class="flex flex-col gap-6">
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{#each ['a', 'b', 'c', 'd'] as key (key)}
					<Skeleton class="h-24 rounded-xl" />
				{/each}
			</div>
			<div class="grid gap-4 lg:grid-cols-2">
				<Skeleton class="h-72 rounded-xl" />
				<Skeleton class="h-72 rounded-xl" />
			</div>
			<Skeleton class="h-72 rounded-xl" />
		</div>
	{/snippet}

	<div
		class="flex flex-col gap-5 transition-opacity duration-200 {isRefreshing
			? 'pointer-events-none opacity-60'
			: ''}"
	>
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<KpiCard
				label="Attended"
				value={totals.totalPresent}
				icon={CheckCircle2}
				detail={totals.trackedExpected > 0
					? `of ${totals.trackedExpected} possible`
					: 'headcount only'}
			/>
			<KpiCard
				label="Attendance rate"
				value={totals.trackedExpected > 0 ? `${totals.attendanceRate}%` : '—'}
				icon={TrendingUp}
				detail={totals.untracked.length > 0
					? `${totals.untracked.length} headcount-only event${totals.untracked.length === 1 ? '' : 's'} excluded`
					: null}
			/>
			<KpiCard label="Average check-in" value={averageCheckIn} icon={Clock} />
			<KpiCard label="Members" value={memberCount} icon={Users} detail="on file today" />
		</div>

		{#if totals.trackedExpected === 0 && summary.length > 0}
			<!-- Saying so beats printing a rate with no denominator behind it. -->
			<p class="text-xs text-muted-foreground">
				No event in this period recorded absences, so there is no expected total to compare against
				and no attendance rate can be shown.
			</p>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base">Recent events</CardTitle>
					<CardDescription class="text-xs">How many attended each event</CardDescription>
				</CardHeader>
				<CardContent>
					<EventTrendChart points={trendPoints} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base">Attendance by group</CardTitle>
					<CardDescription class="text-xs">Each group's own turnout, lowest first</CardDescription>
				</CardHeader>
				<CardContent>
					<GroupParticipation {groups} {eventCountLabel} />
				</CardContent>
			</Card>
		</div>

		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-base">Check-in times</CardTitle>
				<CardDescription class="text-xs">
					When members arrive, in {getConfiguredTimezone()}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<HourlyChart buckets={hourly} />
			</CardContent>
		</Card>
	</div>
</PageShell>

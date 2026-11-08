<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import Progress from '$lib/components/ui/progress';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		CalendarRange,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Download,
		Loader2,
		Search,
		Users
	} from '@lucide/svelte';

	import PersonRow from '$lib/components/attendance/person-row.svelte';
	import EmptyState from '$lib/components/common/empty-state.svelte';
	import KpiCard from '$lib/components/common/kpi-card.svelte';
	import PageShell from '$lib/components/page-shell.svelte';

	import {
		attendanceApi,
		summariseAttendance,
		type AttendanceSummaryRow,
		type RosterEntry,
		type RosterKind
	} from '$lib/api/attendance';
	import { supabase } from '$lib/supabase';
	import { showErrorToast, showWarningToast } from '$lib/utils/errorHandler';
	import { ensureUTC, formatTimeSync, parseEventDate } from '$lib/utils/time';
	import { exportToCSV, exportToPDF, type ExportRecord } from '$lib/utils/attendanceExport';

	/**
	 * Attendance history.
	 *
	 * The previous version fetched every completed event ever on each visit, then issued two
	 * roster queries per event with full member joins - a year of weekly services is over a
	 * hundred round trips - and the month filter discarded nearly all of it client-side.
	 * Loading is now scoped to the selected month via one get_attendance_summary() call, with
	 * each event's roster fetched the first time it is expanded and cached after that.
	 *
	 * Two correctness fixes came with it:
	 *
	 *  - The attendance rate could exceed 100%. Present totals counted every event in the
	 *    month while expected totals skipped events with record_absents off, so the two sides
	 *    of the division described different populations. Both now come from the same subset.
	 *
	 *  - /attendance linked here with ?event=<id> and nothing read it. The parameter now
	 *    selects the right month and opens that event.
	 */

	const MONTH_LABELS = [
		'JAN',
		'FEB',
		'MAR',
		'APR',
		'MAY',
		'JUN',
		'JUL',
		'AUG',
		'SEP',
		'OCT',
		'NOV',
		'DEC'
	];
	const MONTHS_PER_PAGE = 4;
	const ROSTER_PAGE_SIZE = 25;

	type Mode = RosterKind;

	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let isLoadingMonth = $state(false);

	let months = $state<string[]>([]);
	let selectedMonth = $state('');
	let monthPage = $state(0);
	let mode = $state<Mode>('present');

	let summary = $state<AttendanceSummaryRow[]>([]);
	let openEventId = $state<number | null>(null);

	/** Rosters are cached per event and kind, so collapsing and reopening costs nothing. */
	let rosters = $state<Record<string, RosterEntry[]>>({});
	let rosterLoading = $state<string | null>(null);
	let rosterSearch = $state<Record<number, string>>({});
	let rosterPage = $state<Record<number, number>>({});

	let userDisplayName = $state('System User');
	let isExporting = $state(false);

	// -----------------------------------------------------------------------
	// Month handling
	// -----------------------------------------------------------------------

	function monthKey(date: Date) {
		return `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
	}

	/** Inclusive first/last day of a "MON YYYY" key, as the RPC's DATE bounds. */
	function monthBounds(key: string): { from: string; to: string } {
		const [label, year] = key.split(' ');
		const monthIndex = MONTH_LABELS.indexOf(label);
		const y = Number(year);
		const pad = (n: number) => String(n).padStart(2, '0');
		const lastDay = new Date(y, monthIndex + 1, 0).getDate();
		return {
			from: `${y}-${pad(monthIndex + 1)}-01`,
			to: `${y}-${pad(monthIndex + 1)}-${pad(lastDay)}`
		};
	}

	let visibleMonths = $derived(
		months.slice(monthPage * MONTHS_PER_PAGE, (monthPage + 1) * MONTHS_PER_PAGE)
	);
	let hasPrevMonths = $derived(monthPage > 0);
	let hasNextMonths = $derived((monthPage + 1) * MONTHS_PER_PAGE < months.length);

	/** Keep the selected month on screen when it is chosen programmatically (deep link). */
	function pageForMonth(key: string) {
		const index = months.indexOf(key);
		return index < 0 ? 0 : Math.floor(index / MONTHS_PER_PAGE);
	}

	// -----------------------------------------------------------------------
	// Stats
	//
	// Partitioned on records_absents: an event that did not record absentees has no expected
	// total, so it can contribute a headcount but not a rate. Dividing across the two
	// together is what used to let the figure pass 100%.
	// -----------------------------------------------------------------------

	let totals = $derived(summariseAttendance(summary));
	let tracked = $derived(totals.tracked);
	let untracked = $derived(totals.untracked);
	let trackedPresent = $derived(totals.trackedPresent);
	let trackedExpected = $derived(totals.trackedExpected);
	let attendanceRate = $derived(totals.attendanceRate);
	let totalPresent = $derived(totals.totalPresent);
	let averageSize = $derived(totals.averageSize);

	// -----------------------------------------------------------------------
	// Loading
	// -----------------------------------------------------------------------

	async function loadMonths() {
		const dates = await attendanceApi.getCompletedEventDates();
		const seen = new Set<string>();
		// Already ordered newest-first by the query, so insertion order is the display order.
		for (const date of dates) seen.add(monthKey(parseEventDate(date)));
		months = [...seen];
	}

	async function loadMonth(key: string) {
		if (!key) {
			summary = [];
			return;
		}
		isLoadingMonth = true;
		try {
			const { from, to } = monthBounds(key);
			summary = await attendanceApi.getAttendanceSummary(from, to);
		} finally {
			isLoadingMonth = false;
		}
	}

	function rosterKey(eventId: number, kind: Mode) {
		return `${eventId}:${kind}`;
	}

	async function ensureRoster(eventId: number, kind: Mode) {
		const key = rosterKey(eventId, kind);
		if (rosters[key]) return;
		rosterLoading = key;
		try {
			rosters[key] = await attendanceApi.getEventRoster(eventId, kind);
		} catch (error) {
			showErrorToast(error, 'Could not load this roster');
		} finally {
			rosterLoading = null;
		}
	}

	async function toggleEvent(eventId: number) {
		if (openEventId === eventId) {
			openEventId = null;
			return;
		}
		openEventId = eventId;
		rosterPage[eventId] = 1;
		await ensureRoster(eventId, mode);
	}

	async function selectMonth(key: string) {
		if (key === selectedMonth) return;
		selectedMonth = key;
		openEventId = null;
		try {
			await loadMonth(key);
		} catch (error) {
			showErrorToast(error, 'Could not load that month');
		}
	}

	async function setMode(next: Mode) {
		if (next === mode) return;
		mode = next;
		// The open event needs the other roster; everything else loads on demand.
		if (openEventId !== null) await ensureRoster(openEventId, next);
	}

	/** Deep link from /attendance's "Recent Sessions" cards. */
	async function openFromQuery(eventIdRaw: string) {
		const eventId = Number(eventIdRaw);
		if (!Number.isFinite(eventId)) return;

		const { data, error } = await supabase
			.from('events')
			.select('event_date')
			.eq('event_id', eventId)
			.maybeSingle();

		if (error || !data) return;

		const key = monthKey(parseEventDate(data.event_date as string));
		if (!months.includes(key)) return;

		selectedMonth = key;
		monthPage = pageForMonth(key);
		await loadMonth(key);

		if (!summary.some((row) => row.event_id === eventId)) return;
		openEventId = eventId;
		rosterPage[eventId] = 1;
		await ensureRoster(eventId, mode);

		await tick();
		document
			.getElementById(`event-${eventId}`)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	onMount(async () => {
		try {
			await loadMonths();

			const requested = $page.url.searchParams.get('event');
			if (requested) {
				await openFromQuery(requested);
			}
			if (!selectedMonth && months.length > 0) {
				selectedMonth = months[0];
				await loadMonth(selectedMonth);
			}

			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (session) {
				const { data: profile } = await supabase
					.from('profiles')
					.select('full_name, email')
					.eq('id', session.user.id)
					.maybeSingle();
				userDisplayName =
					profile?.full_name || profile?.email || session.user.email || 'System User';
			}
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Could not load attendance history.';
			showErrorToast(error, 'History unavailable');
		} finally {
			isLoading = false;
		}
	});

	// -----------------------------------------------------------------------
	// Roster display
	// -----------------------------------------------------------------------

	function filterRoster(entries: RosterEntry[], query: string | undefined) {
		if (!query?.trim()) return entries;
		const q = query.toLowerCase();
		return entries.filter(
			(entry) =>
				`${entry.first_name} ${entry.last_name}`.toLowerCase().includes(q) ||
				entry.care_group.toLowerCase().includes(q)
		);
	}

	function countFor(row: AttendanceSummaryRow) {
		return mode === 'present' ? row.present_count : row.absent_count;
	}

	// -----------------------------------------------------------------------
	// Export
	//
	// exportToCSV/exportToPDF are already generic over viewMode; what was duplicated were six
	// call sites that each rebuilt the records, the period label and the same stats object.
	// -----------------------------------------------------------------------

	function buildRecords(
		rows: AttendanceSummaryRow[],
		kind: Mode,
		entriesFor: (id: number) => RosterEntry[]
	) {
		const records: ExportRecord[] = [];
		for (const row of rows) {
			for (const entry of entriesFor(row.event_id)) {
				records.push({
					member_id: entry.member_id,
					care_group: entry.care_group,
					event_name: row.event_name,
					event_date: row.event_date,
					first_name: entry.first_name,
					last_name: entry.last_name,
					...(kind === 'present'
						? {
									time: entry.scan_datetime
										? formatTimeSync(new Date(ensureUTC(entry.scan_datetime)))
										: '-'
								}
						: {})
				});
			}
		}
		return records;
	}

	/**
	 * `scope` undefined exports the whole month, which needs every roster in it - so they are
	 * fetched here rather than up front, which is the whole point of loading them lazily.
	 */
	async function runExport(format: 'csv' | 'pdf', scope?: AttendanceSummaryRow) {
		const rows = scope ? [scope] : summary;
		if (rows.length === 0) {
			showWarningToast('There are no events in this month to export.', 'Nothing to export');
			return;
		}

		isExporting = true;
		try {
			await Promise.all(rows.map((row) => ensureRoster(row.event_id, mode)));

			const records = buildRecords(rows, mode, (id) => rosters[rosterKey(id, mode)] ?? []);
			if (records.length === 0) {
				showWarningToast(
					mode === 'present'
						? 'No one was marked present in this selection.'
						: 'No one was marked absent in this selection.',
					'Nothing to export'
				);
				return;
			}

			const periodLabel = scope
				? parseEventDate(scope.event_date).toLocaleString('default', {
						month: 'long',
						year: 'numeric'
					})
				: selectedMonth;

			const statsRows = scope ? [scope] : tracked;
			const present = statsRows.reduce((sum, row) => sum + row.present_count, 0);
			const absent = statsRows.reduce((sum, row) => sum + row.absent_count, 0);
			const options = {
				viewMode: mode,
				selectedMonth: periodLabel,
				stats: {
					totalPresent: present,
					totalAbsent: absent,
					attendanceRate:
						present + absent > 0 ? Math.round((present / (present + absent)) * 100) : 0
				},
				generatedBy: userDisplayName
			};

			if (format === 'csv') {
				exportToCSV(records, options);
			} else {
				await exportToPDF(records, options);
			}
		} catch (error) {
			// jspdf and jspdf-autotable are dependencies; the old handler told the user to npm
			// install them, which was both wrong and useless to anyone running the app.
			showErrorToast(error, 'Export failed');
		} finally {
			isExporting = false;
		}
	}
</script>

<svelte:head>
	<title>Attendance History | {siteConfig.name}</title>
</svelte:head>

<PageShell
	title="Attendance History"
	description="Monthly totals and the roster for every completed event."
	backTo="/settings"
	{isLoading}
	error={loadError}
	onRetry={() => window.location.reload()}
>
	{#snippet skeleton()}
		<!--
			Mirrors the real grid, not three equal boxes: same responsive classes as the live
			one below, so the loading state doesn't jump in shape once data arrives. Rate's
			placeholder spans two columns below lg and is taller, matching the Card it stands
			in for being bigger than a KpiCard.
		-->
		<div class="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-[1.3fr_1fr_1fr] lg:items-stretch">
			<Skeleton class="col-span-2 h-48 rounded-xl lg:col-span-1" />
			<Skeleton class="h-32 rounded-xl" />
			<Skeleton class="h-32 rounded-xl" />
		</div>
		<Skeleton class="h-12 w-full rounded-2xl" />
		<div class="space-y-3">
			{#each ['a', 'b', 'c'] as key (key)}
				<Skeleton class="h-20 w-full rounded-2xl" />
			{/each}
		</div>
	{/snippet}

	{#if months.length === 0}
		<EmptyState
			icon={CalendarRange}
			title="No completed events yet"
			description="Once an event finishes, its attendance is recorded here."
		/>
	{:else}
		<!--
			One grid, not two stacked ones. Below lg, Rate spans both columns (full width,
			row of its own) and Events/Average sit side by side beneath it - the layout this
			already had. At lg and up the columns become 1.3fr/1fr/1fr and Rate's span drops
			to 1, so all three land in a single row with Rate wider - the thing the design
			actually showed and the real page wasn't doing: it just stacked Rate above a
			separate 2-up grid at every width, desktop included.
		-->
		<div class="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-[1.3fr_1fr_1fr] lg:items-stretch">
			<Card class="col-span-2 lg:col-span-1">
				<CardHeader class="flex flex-row items-center justify-between gap-3 pb-2">
				<div class="min-w-0">
					<h2 class="truncate font-bold">Attendance Rate</h2>
					<p class="mt-0.5 text-[11px] text-muted-foreground">
						{#if untracked.length > 0}
							Across {tracked.length}
							{tracked.length === 1 ? 'event' : 'events'} that recorded absences
						{:else}
							{selectedMonth}
						{/if}
					</p>
				</div>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								size="sm"
								class="shrink-0 gap-2"
								disabled={isExporting}
							>
								{#if isExporting}
									<Loader2 class="h-4 w-4 animate-spin" />
								{:else}
									<Download class="h-4 w-4" />
								{/if}
								<span class="hidden sm:inline">Export</span>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Group>
							<DropdownMenu.GroupHeading
								class="px-2 py-1.5 text-[10px] tracking-wide text-muted-foreground uppercase"
							>
								{mode === 'present' ? 'Present' : 'Absent'} · {selectedMonth}
							</DropdownMenu.GroupHeading>
							<DropdownMenu.Item onclick={() => runExport('csv')}>
								<Download class="mr-2 h-4 w-4" />
								Export as CSV
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => runExport('pdf')}>
								<Download class="mr-2 h-4 w-4" />
								Export as PDF
							</DropdownMenu.Item>
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</CardHeader>
			<CardContent>
				{#if trackedExpected === 0}
					<p class="text-sm text-muted-foreground">
						No event this month recorded absences, so there is no expected total to compare against. {totalPresent}
						attended in total.
					</p>
				{:else}
					<div class="flex items-end justify-between gap-3">
						<div class="text-4xl font-black tabular-nums">
							{attendanceRate}<small class="text-primary">%</small>
						</div>
						<div class="text-right text-xs text-muted-foreground">
							<div class="tabular-nums">{trackedPresent} / {trackedExpected}</div>
							<div>{selectedMonth}</div>
						</div>
					</div>
					<div class="mt-4">
						<Progress value={attendanceRate} max={100} />
					</div>
					{#if untracked.length > 0}
						<!-- Folding these into the rate is what used to push it past 100%. -->
						<p class="mt-3 text-[11px] text-muted-foreground">
							{untracked.length}
							{untracked.length === 1 ? 'event' : 'events'} this month recorded only a headcount and
							{untracked.length === 1 ? 'is' : 'are'} excluded from this rate.
						</p>
					{/if}
				{/if}
			</CardContent>
			</Card>

			<!--
				Real KpiCard, not a one-off div - these two were rounded-2xl/border-border-40 with
				no icon and no shadow, matching neither the Rate Card beside them nor the four
				KpiCards Analytics builds from this same component. Direct children of the grid
				above, not a second nested grid - that is what kept them from ever joining Rate's
				row at lg.
			-->
			<KpiCard label="Events" value={summary.length} icon={CalendarRange} detail="This month" />
			<KpiCard label="Average" value={averageSize} icon={Users} detail="Attended per event" />
		</div>

		<!-- Month strip + present/absent -->
		<div class="flex flex-col items-center gap-3 md:flex-row md:justify-between">
			<div class="flex items-center gap-1.5">
				<button
					class="rounded-full p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-40"
					disabled={!hasPrevMonths}
					aria-label="Earlier months"
					onclick={() => monthPage--}
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				{#each visibleMonths as key (key)}
					<button
						class="rounded-full px-3 py-2 text-xs font-bold transition md:px-5 md:text-sm {key ===
						selectedMonth
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-muted'}"
						onclick={() => selectMonth(key)}
					>
						{key}
					</button>
				{/each}
				<button
					class="rounded-full p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-40"
					disabled={!hasNextMonths}
					aria-label="Later months"
					onclick={() => monthPage++}
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>

			<div
				role="tablist"
				aria-label="Present or absent"
				class="inline-flex rounded-2xl border border-border/40 bg-card/40 p-1"
			>
				<button
					role="tab"
					aria-selected={mode === 'present'}
					class="rounded-xl px-5 py-2 text-sm font-bold transition {mode === 'present'
						? 'bg-primary text-primary-foreground shadow-sm'
						: 'text-muted-foreground'}"
					onclick={() => setMode('present')}
				>
					PRESENT
				</button>
				<button
					role="tab"
					aria-selected={mode === 'absent'}
					class="rounded-xl px-5 py-2 text-sm font-bold transition {mode === 'absent'
						? 'bg-destructive text-white shadow-sm'
						: 'text-muted-foreground'}"
					onclick={() => setMode('absent')}
				>
					ABSENT
				</button>
			</div>
		</div>

		<!-- Events -->
		{#if isLoadingMonth}
			<div class="space-y-3">
				{#each ['a', 'b', 'c'] as key (key)}
					<Skeleton class="h-20 w-full rounded-2xl" />
				{/each}
			</div>
		{:else if summary.length === 0}
			<EmptyState
				icon={CalendarRange}
				title="No events in {selectedMonth}"
				description="Pick another month from the strip above."
				compact
			/>
		{:else}
			<div class="space-y-3">
				{#each summary as row (row.event_id)}
					{@const isOpen = openEventId === row.event_id}
					{@const key = rosterKey(row.event_id, mode)}
					{@const entries = rosters[key] ?? []}
					{@const query = rosterSearch[row.event_id] ?? ''}
					{@const matches = filterRoster(entries, query)}
					{@const pageNum = rosterPage[row.event_id] ?? 1}
					{@const totalPages = Math.max(1, Math.ceil(matches.length / ROSTER_PAGE_SIZE))}
					{@const visible = matches.slice(
						(pageNum - 1) * ROSTER_PAGE_SIZE,
						pageNum * ROSTER_PAGE_SIZE
					)}

					<div
						id="event-{row.event_id}"
						class="overflow-hidden rounded-2xl border border-border/40 bg-card"
					>
						<div class="flex flex-col gap-3 p-4 md:p-5">
							<div class="flex items-center justify-between gap-3">
								<div class="flex min-w-0 flex-1 items-center gap-3">
									<div class="h-10 w-1.5 shrink-0 rounded-full bg-primary/60"></div>
									<div class="min-w-0">
										<div class="truncate font-bold uppercase">{row.event_name}</div>
										<div class="mt-0.5 text-xs text-muted-foreground">
											{parseEventDate(row.event_date).toLocaleDateString(undefined, {
												month: 'short',
												day: 'numeric',
												year: 'numeric'
											})}
											{#if !row.records_absents}
												· headcount only
											{/if}
										</div>
									</div>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<div
										class="rounded-md bg-muted px-3 py-1 text-sm font-medium tabular-nums"
										title={mode === 'present' ? 'Present' : 'Absent'}
									>
										{countFor(row)}
									</div>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<button
													{...props}
													class="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-muted"
													title="Export this event"
													aria-label="Export {row.event_name}"
												>
													<Download class="h-4 w-4" />
												</button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Group>
												<DropdownMenu.Item onclick={() => runExport('csv', row)}>
													<Download class="mr-2 h-4 w-4" />
													CSV
												</DropdownMenu.Item>
												<DropdownMenu.Item onclick={() => runExport('pdf', row)}>
													<Download class="mr-2 h-4 w-4" />
													PDF
												</DropdownMenu.Item>
											</DropdownMenu.Group>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
									<button
										class="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-muted"
										aria-expanded={isOpen}
										aria-label={isOpen ? 'Collapse' : 'Expand'}
										onclick={() => toggleEvent(row.event_id)}
									>
										{#if isOpen}
											<ChevronDown class="h-4 w-4" />
										{:else}
											<ChevronRight class="h-4 w-4" />
										{/if}
									</button>
								</div>
							</div>

							{#if isOpen && entries.length > 0}
								<div class="relative">
									<Search
										class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
									/>
									<Input
										type="search"
										placeholder="Search by name or group..."
										class="pl-10"
										value={query}
										oninput={(e) => {
											rosterSearch[row.event_id] = (e.target as HTMLInputElement).value;
											rosterPage[row.event_id] = 1;
										}}
									/>
								</div>
								{#if query}
									<div class="text-xs text-muted-foreground">
										{matches.length} of {entries.length}
										{mode}
									</div>
								{/if}
							{/if}
						</div>

						{#if isOpen}
							<div class="border-t border-border/40 p-3 md:p-4">
								{#if rosterLoading === key}
									<div class="space-y-2">
										{#each ['a', 'b', 'c', 'd'] as skeletonKey (skeletonKey)}
											<div class="flex items-center gap-3 p-2">
												<Skeleton class="h-9 w-9 rounded-full" />
												<div class="flex-1 space-y-1.5">
													<Skeleton class="h-3.5 w-36" />
													<Skeleton class="h-3 w-20" />
												</div>
											</div>
										{/each}
									</div>
								{:else if entries.length === 0}
									<p class="py-4 text-center text-sm text-muted-foreground">
										{mode === 'present'
											? 'No one was marked present for this event.'
											: row.records_absents
												? 'No one was marked absent for this event.'
												: 'This event recorded only a headcount, so it has no absence list.'}
									</p>
								{:else if matches.length === 0}
									<p class="py-4 text-center text-sm text-muted-foreground">No members found</p>
								{:else}
									<div class="space-y-1">
										{#each visible as entry (entry.member_id)}
											<PersonRow
												firstName={entry.first_name}
												lastName={entry.last_name}
												careGroup={entry.care_group}
											>
												{#snippet trailing()}
													{#if mode === 'present'}
														<span
															class="rounded-md bg-primary/10 px-2.5 py-1 text-xs text-primary tabular-nums"
														>
															{entry.scan_datetime
																? formatTimeSync(new Date(ensureUTC(entry.scan_datetime)))
																: '—'}
														</span>
													{:else}
														<span
															class="rounded-md bg-destructive/10 px-2.5 py-1 text-xs text-destructive"
														>
															Absent
														</span>
													{/if}
												{/snippet}
											</PersonRow>
										{/each}
									</div>

									{#if totalPages > 1}
										<div
											class="mt-3 flex items-center justify-between gap-3 border-t border-border/40 pt-3"
										>
											<span class="text-xs text-muted-foreground tabular-nums">
												{(pageNum - 1) * ROSTER_PAGE_SIZE + 1}–{Math.min(
													pageNum * ROSTER_PAGE_SIZE,
													matches.length
												)} of {matches.length}
											</span>
											<div class="flex items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													class="h-8 px-2.5 text-xs"
													disabled={pageNum === 1}
													onclick={() => (rosterPage[row.event_id] = pageNum - 1)}
												>
													<ChevronLeft class="h-3.5 w-3.5" />
												</Button>
												<span class="text-xs font-medium tabular-nums">
													{pageNum} / {totalPages}
												</span>
												<Button
													variant="outline"
													size="sm"
													class="h-8 px-2.5 text-xs"
													disabled={pageNum >= totalPages}
													onclick={() => (rosterPage[row.event_id] = pageNum + 1)}
												>
													<ChevronRight class="h-3.5 w-3.5" />
												</Button>
											</div>
										</div>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</PageShell>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription
	} from '$lib/components/ui/card';
	import { ChevronLeft, TrendingUp, Users, Clock, CheckCircle2 } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { Skeleton } from '$lib/components/ui/skeleton';

	import * as Select from '$lib/components/ui/select';
	import { ChartContainer } from '$lib/components/ui/chart';
	import { BarChart, LineChart } from 'layerchart';
	import { curveMonotoneX } from 'd3-shape';

	const lineChartConfig = {
		attendance: { label: 'Attendance', color: 'hsl(var(--primary))' }
	};
	const barChartConfig = {
		count: { label: 'Check-ins', color: 'hsl(var(--primary))' }
	};

	const tooltipProps = {
		root: {
			variant: 'none' as const,
			classes: {
				container: 'rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-xl text-popover-foreground'
			}
		}
	};

	/** Compute SVG polygon points for a radar chart.
	 * @param groups - array of { name, attendance, target }
	 * @param cx - center x, cy - center y, r - max radius
	 */
	function radarPoints(
		groups: { name: string; attendance: number; target: number }[],
		cx: number,
		cy: number,
		r: number,
		scale = 1
	): string {
		if (!groups.length) return '';
		const n = groups.length;
		return groups
			.map((g, i) => {
				const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
				const ratio = g.target > 0 ? Math.min((g.attendance / g.target) * scale, 1) : 0;
				return `${cx + r * ratio * Math.cos(angle)},${cy + r * ratio * Math.sin(angle)}`;
			})
			.join(' ');
	}

	/** Compute label positions for radar axes. */
	function radarLabels(
		groups: { name: string; attendance: number; target: number }[],
		cx: number,
		cy: number,
		r: number
	) {
		const n = groups.length;
		return groups.map((g, i) => {
			const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			// Push labels far enough out so long names don't overlap spokes
			const labelDist = r + 28;
			return {
				name: g.name.length > 12 ? g.name.slice(0, 11) + '…' : g.name,
				attendance: g.attendance,
				target: g.target,
				x: cx + labelDist * cos,
				y: cy + labelDist * sin,
				lineX: cx + r * cos,
				lineY: cy + r * sin,
				anchor: cos > 0.2 ? 'start' : cos < -0.2 ? 'end' : 'middle'
			};
		});
	}

	let stats = $state({
		totalAttendance: 0,
		totalExpected: 0,
		attendanceRate: 0,
		averageCheckInTime: '--:--',
		activeMembers: 0,
		weekTrend: [] as { day: string; attendance: number; target: number; name: string; date: string }[],
		groupAttendance: [] as { name: string; attendance: number; target: number }[],
		hourlyData: [] as { hour: string; count: number }[]
	});

	let eventsList = $state<{ id: string; name: string; date: string; status: string }[]>([]);
	let selectedEventId = $state<string>('all');
	
	// Tooltip state for radar charts
	let hoveredRadarNode = $state<{ name: string; attendance: number; target: number; x: number; y: number; viewBox: number } | null>(null);

	let selectedEventName = $derived(
		selectedEventId === 'all'
			? 'Last Month'
			: eventsList.find((e) => e.id === selectedEventId)?.name || 'Unknown Event'
	);

	let isLoading = $state(true);

	onMount(async () => {
		isLoading = true;
		try {
			await fetchEventsList();
			await fetchAnalytics();
		} finally {
			isLoading = false;
		}
	});

	async function fetchEventsList() {
		const { data } = await supabase
			.from('events')
			.select('event_id, event_name, event_date, status')
			.eq('status', 'completed')
			.order('event_date', { ascending: false });
		
		if (data) {
			eventsList = data.map(d => ({
				id: String(d.event_id),
				name: d.event_name,
				date: d.event_date,
				status: d.status
			}));
		}
	}

	async function handleEventChange(value: string) {
		selectedEventId = value;
		isLoading = true;
		try {
			await fetchAnalytics();
		} finally {
			isLoading = false;
		}
	}

	function formatEventDate(dateStr: string): string {
		if (!dateStr) return '';
		// dateStr is YYYY-MM-DD
		const [year, month, day] = dateStr.split('-').map(Number);
		const d = new globalThis.Date(year, month - 1, day);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	async function fetchAnalytics() {
		const d = new globalThis.Date();
		d.setMonth(d.getMonth() - 1);
		const lastMonthIso = d.toISOString();

		// Base query for attendance
		let attendanceQuery = supabase.from('attendance_present').select('*', { count: 'exact', head: true });
		let eventCountQuery = supabase.from('events').select('event_id').eq('status', 'completed');

		if (selectedEventId !== 'all') {
			attendanceQuery = attendanceQuery.eq('event_id', selectedEventId);
		} else {
			attendanceQuery = attendanceQuery.gte('scan_datetime', lastMonthIso);
			eventCountQuery = eventCountQuery.gte('event_date', lastMonthIso);
		}
		const { count: totalPresent } = await attendanceQuery;

		// Active Members
		const { count: memberCount } = await supabase
			.from('members')
			.select('*', { count: 'exact', head: true });

		// Attendance Rate
		let completedEventCount = 0;
		if (selectedEventId === 'all') {
			const { data: events } = await eventCountQuery;
			completedEventCount = events?.length || 0;
		} else {
			const evt = eventsList.find(e => e.id === selectedEventId);
			completedEventCount = evt?.status === 'completed' ? 1 : 0;
		}

		const totalExpected = completedEventCount * (memberCount || 0);
		const rate = totalExpected > 0 ? Math.round(((totalPresent || 0) / totalExpected) * 100) : 0;

		// Group Attendance
		const { data: groups } = await supabase.from('groups').select('group_id, name, group_code');

		const groupData = await Promise.all(
			(groups || []).map(async (g) => {
				let gPresentQuery = supabase
					.from('attendance_present')
					.select('*, members!inner(group_id)', { count: 'exact', head: true })
					.eq('members.group_id', g.group_id);
				
				if (selectedEventId !== 'all') {
					gPresentQuery = gPresentQuery.eq('event_id', selectedEventId);
				} else {
					gPresentQuery = gPresentQuery.gte('scan_datetime', lastMonthIso);
				}
				const { count: gPresent } = await gPresentQuery;

				const { count: gTotal } = await supabase
					.from('members')
					.select('*', { count: 'exact', head: true })
					.eq('group_id', g.group_id);

				return {
					name: g.name || g.group_code,
					attendance: gPresent || 0,
					target: totalPresent || 0
				};
			})
		);

		// Recent Events Trend (Last 5 events)
		let recentEventsQuery = supabase
			.from('events')
			.select('event_id, event_name, event_date')
			.eq('status', 'completed')
			.order('event_date', { ascending: false })
			.limit(5);

		if (selectedEventId !== 'all') {
			recentEventsQuery = recentEventsQuery.eq('event_id', selectedEventId);
		}
		const { data: recentEventsData } = await recentEventsQuery;

		const recentEvents = (recentEventsData || []).reverse(); // Order left to right (oldest to newest)

		const weeklyTrend = await Promise.all(
			recentEvents.map(async (evt, index) => {
				const { count } = await supabase
					.from('attendance_present')
					.select('*', { count: 'exact', head: true })
					.eq('event_id', evt.event_id);
				
				const dateObj = new Date(evt.event_date);
				const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
				
				return {
					day: `E${index + 1}`,
					name: evt.event_name,
					date: formattedDate,
					attendance: count || 0,
					target: memberCount || 0
				};
			})
		);

		// Average Check-in Time & Hourly Distribution
		let recentScansQuery = supabase.from('attendance_present').select('scan_datetime');
		if (selectedEventId !== 'all') {
			recentScansQuery = recentScansQuery.eq('event_id', selectedEventId);
		} else {
			recentScansQuery = recentScansQuery.gte('scan_datetime', lastMonthIso);
		}
		const { data: recentScans } = await recentScansQuery;

		let avgTimeStr = '--:--';
		const hourlyCount = new Array(24).fill(0);

		// Enforce GMT+8 timezone for proper time conversion
		let userTimezone = 'Asia/Manila';

		if (recentScans && recentScans.length > 0) {
			const tzFormatter = new Intl.DateTimeFormat('en-US', {
				timeZone: userTimezone,
				hour: 'numeric',
				minute: 'numeric',
				hourCycle: 'h23'
			});

			const totalMinutes = recentScans.reduce((acc, s) => {
				let dateStr = s.scan_datetime;
				if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
					dateStr = dateStr.replace(' ', 'T') + 'Z';
				}
				const d = new globalThis.Date(dateStr);
				const parts = tzFormatter.formatToParts(d);
				
				const hourStr = parts.find((p) => p.type === 'hour')?.value || '0';
				const minStr = parts.find((p) => p.type === 'minute')?.value || '0';
				
				const hourInUserTz = parseInt(hourStr, 10);
				const minute = parseInt(minStr, 10);

				hourlyCount[hourInUserTz]++;
				return acc + hourInUserTz * 60 + minute;
			}, 0);
			const avgMinutes = Math.round(totalMinutes / recentScans.length);
			const hours = Math.floor(avgMinutes / 60);
			const minutes = avgMinutes % 60;

			// Format using global time format setting (12h or 24h)
			const use12HourFormat =
				typeof localStorage !== 'undefined' && localStorage.getItem('time_format') === '12h';
			if (use12HourFormat) {
				const displayHours = hours % 12 || 12;
				const period = hours >= 12 ? 'PM' : 'AM';
				avgTimeStr = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
			} else {
				avgTimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
			}
		}

		// Convert hourly count to display format (only showing hours with data)
		const hourlyData = [];
		for (let i = 0; i < 24; i++) {
			if (hourlyCount[i] > 0) {
				const displayHour = i % 12 || 12;
				const period = i >= 12 ? 'PM' : 'AM';
				hourlyData.push({
					hour: `${displayHour} ${period}`,
					count: hourlyCount[i]
				});
			}
		}

		stats = {
			totalAttendance: totalPresent || 0,
			totalExpected: totalExpected,
			attendanceRate: rate,
			averageCheckInTime: avgTimeStr,
			activeMembers: memberCount || 0,
			weekTrend: weeklyTrend,
			groupAttendance: groupData.filter((g) => g.target > 0),
			hourlyData: hourlyData
		};
	}
</script>

<!-- Event selector is rendered above the loading gate so it persists during re-fetches -->
<!-- Mobile event selector -->
<div class="sticky top-0 z-20 border-b border-border/10 bg-background px-4 py-3 md:hidden">
	<div class="flex items-center gap-2">
		<button onclick={() => void goto('/settings')} class="shrink-0 rounded-lg p-1.5 transition hover:bg-muted">
			<ChevronLeft class="h-5 w-5" />
		</button>
		<div class="flex-1">
			<Select.Root type="single" value={selectedEventId} onValueChange={handleEventChange}>
				<Select.Trigger class="w-full h-9 bg-card border-border/20 shadow-sm">
					{selectedEventName}
				</Select.Trigger>
				<Select.Content class="max-h-[280px] overflow-y-auto">
					<Select.Item value="all">Last Month</Select.Item>
					{#each eventsList as event (event.id)}
						<Select.Item value={event.id}>
							<div class="flex flex-col">
								<span class="font-medium">{event.name}</span>
								<span class="text-xs text-muted-foreground">{formatEventDate(event.date)}</span>
							</div>
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>
</div>

{#if isLoading}
	<!-- Mobile View -->
	<div class="flex min-h-screen flex-col bg-background pb-20 md:hidden">
		<!-- Header -->
		<div class="sticky top-0 z-10 hidden border-b border-border/10 bg-background sm:flex">
			<div class="flex w-full items-center gap-3 px-4 py-4">
				<Skeleton class="h-8 w-8 rounded-lg" />
				<div class="space-y-1">
					<Skeleton class="h-6 w-24" />
					<Skeleton class="h-3 w-32" />
				</div>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 space-y-6 px-4 py-6">
			<!-- Event Selector placeholder during loading -->
			<div class="mb-4">
				<Skeleton class="h-9 w-full rounded-md" />
			</div>

			<!-- Stats Grid -->
			<div class="grid grid-cols-2 gap-3">
				{#each Array(4) as _, i (i)}
					<Card>
						<CardContent class="p-4 space-y-2">
							<Skeleton class="h-8 w-8 rounded-md" />
							<Skeleton class="h-8 w-16" />
							<Skeleton class="h-3 w-20" />
						</CardContent>
					</Card>
				{/each}
			</div>

			<!-- Large Cards -->
			{#each Array(3) as _, i (i)}
				<Card>
					<CardHeader class="pb-3">
						<Skeleton class="h-5 w-40" />
					</CardHeader>
					<CardContent>
						<div class="space-y-4">
							{#each Array(4) as _, i (i)}
								<div class="space-y-2">
									<div class="flex justify-between">
										<Skeleton class="h-3 w-10" />
										<Skeleton class="h-3 w-16" />
									</div>
									<Skeleton class="h-2 w-full rounded-full" />
								</div>
							{/each}
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	</div>

	<!-- Desktop View -->
	<div class="mx-auto hidden max-w-7xl flex-col gap-6 p-6 md:flex lg:p-8">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="space-y-2">
				<Skeleton class="h-9 w-32" />
				<Skeleton class="h-4 w-48" />
			</div>
			<Skeleton class="h-10 w-32 rounded-md" />
		</div>

		<!-- Stats Grid -->
		<div class="grid grid-cols-4 gap-4">
			{#each Array(1) as _, i (i)}
				<Card>
					<CardContent class="p-6 space-y-2">
						<Skeleton class="h-10 w-10 rounded-md" />
						<Skeleton class="h-8 w-20" />
						<Skeleton class="h-4 w-24" />
					</CardContent>
				</Card>
			{/each}
		</div>

		<div class="grid grid-cols-2 gap-6">
			{#each Array(2) as _, i (i)}
				<Card>
					<CardHeader>
						<Skeleton class="h-6 w-32" />
						<Skeleton class="h-4 w-48" />
					</CardHeader>
					<CardContent>
						<div class="space-y-4">
							{#each Array(5) as _, i (i)}
								<div class="space-y-2">
									<div class="flex justify-between">
										<Skeleton class="h-4 w-12" />
										<Skeleton class="h-4 w-20" />
									</div>
									<Skeleton class="h-3 w-full rounded-full" />
								</div>
							{/each}
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>

		<!-- Bottom Card -->
		<Card>
			<CardHeader>
				<Skeleton class="h-6 w-48" />
				<Skeleton class="h-4 w-64" />
			</CardHeader>
			<CardContent>
				<div class="space-y-4">
					{#each Array(3) as _, i (i)}
						<div class="space-y-2">
							<div class="flex justify-between">
								<Skeleton class="h-4 w-16" />
								<Skeleton class="h-4 w-12" />
							</div>
							<Skeleton class="h-3 w-full rounded-full" />
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	</div>
{:else}
	<!-- Mobile View -->
	<div class="flex min-h-screen flex-col bg-background pb-20 md:hidden">
		<!-- Content -->
		<div class="flex-1 space-y-6 px-4 py-6">
			<!-- Stats Grid -->
			<div class="grid grid-cols-2 gap-3">
				<Card>
					<CardContent class="p-4">
						<div class="mb-3 flex items-start justify-between">
							<div class="rounded-md bg-primary/10 p-2 text-primary">
								<Users class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.totalAttendance} / {stats.totalExpected}</div>
						<p class="mt-1 text-xs text-muted-foreground">Total Attendance</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent class="p-4">
						<div class="mb-3 flex items-start justify-between">
							<div class="rounded-md bg-green-500/10 p-2 text-green-500">
								<CheckCircle2 class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.attendanceRate}%</div>
						<p class="mt-1 text-xs text-muted-foreground">Attendance Rate</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent class="p-4">
						<div class="mb-3 flex items-start justify-between">
							<div class="rounded-md bg-blue-500/10 p-2 text-blue-500">
								<Clock class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.averageCheckInTime}</div>
						<p class="mt-1 text-xs text-muted-foreground">Avg Check-In</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent class="p-4">
						<div class="mb-3 flex items-start justify-between">
							<div class="rounded-md bg-purple-500/10 p-2 text-purple-500">
								<TrendingUp class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.activeMembers}</div>
						<p class="mt-1 text-xs text-muted-foreground">Total Members</p>
					</CardContent>
				</Card>
			</div>

			<!-- Recent Events Trend -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base">Recent Events</CardTitle>
					<CardDescription class="text-xs">Attendance for recent events</CardDescription>
				</CardHeader>
				<CardContent>
					{#if stats.weekTrend.length > 0}
						<ChartContainer config={lineChartConfig} class="h-[200px] w-full">
							<LineChart 
								data={stats.weekTrend} 
								x="day" 
								y="attendance" 
								series={[{ key: 'attendance', label: 'Attendance' }]}
								points={true}
								props={{ 
									spline: { class: 'stroke-primary stroke-2', curve: curveMonotoneX },
									points: { class: 'fill-primary stroke-card stroke-2', r: 4 },
									tooltip: tooltipProps 
								}}
							/>
						</ChartContainer>
						
						<!-- Event Legend -->
						<div class="mt-4 grid grid-cols-1 gap-2 pt-2 border-t text-xs">
							{#each stats.weekTrend as item (item.day)}
								<div class="flex items-center gap-3">
									<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 font-bold text-primary">
										{item.day.replace('E', '')}
									</div>
									<div class="flex flex-col overflow-hidden">
										<span class="truncate font-medium text-foreground">{item.name}</span>
										<span class="text-[10px] text-muted-foreground">{item.date}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-xs text-center text-muted-foreground py-4 italic">
							No data available
						</p>
					{/if}
				</CardContent>
			</Card>

			<!-- Group Performance Radar -->
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-base">Attendance Distribution</CardTitle>
					<CardDescription class="text-xs">Share of total attendance by group</CardDescription>
				</CardHeader>
				<CardContent class="flex flex-col items-center pb-4">
					{#if stats.groupAttendance.length > 0}
						{@const CX = 145}
						{@const CY = 145}
						{@const R = 80}
						{@const RINGS = 4}
						{@const maxRatio = stats.groupAttendance.reduce((max, g) => Math.max(max, g.target > 0 ? g.attendance / g.target : 0), 0.1)}
						{@const radarScale = 1 / maxRatio}
						{@const labels = radarLabels(stats.groupAttendance, CX, CY, R)}
						{@const n = stats.groupAttendance.length}
						<div class="relative w-full max-w-[290px]">
							<svg role="application" viewBox="0 0 290 290" class="w-full overflow-visible" onpointerleave={() => hoveredRadarNode = null}>
								<!-- Grid rings -->
								{#each Array(RINGS) as _, ri (ri)}
									<polygon
										points={radarPoints(
											stats.groupAttendance.map((g) => ({ ...g, attendance: g.target * ((ri + 1) / RINGS) })),
											CX, CY, R
										)}
										class="fill-none stroke-border"
										stroke-width="1"
									/>
								{/each}
								<!-- Axis lines -->
								{#each labels as label (label.name)}
									<line x1={CX} y1={CY} x2={label.lineX} y2={label.lineY} class="stroke-border" stroke-width="1" />
								{/each}
								<!-- Data polygon -->
								<polygon
									points={radarPoints(stats.groupAttendance, CX, CY, R, radarScale)}
									class="stroke-primary"
									style="fill: hsl(var(--primary) / 0.2)"
									stroke-width="2"
									stroke-linejoin="round"
								/>
								<!-- Data points -->
								{#each labels as label, i (label.name)}
									{@const angle = (i / n) * 2 * Math.PI - Math.PI / 2}
									{@const ratio = label.target > 0 ? Math.min((label.attendance / label.target) * radarScale, 1) : 0}
									{@const px = CX + R * ratio * Math.cos(angle)}
									{@const py = CY + R * ratio * Math.sin(angle)}
									<!-- Hover target -->
									<circle
										cx={px}
										cy={py}
										r="16"
										class="fill-transparent outline-none"
										role="graphics-symbol"
										tabindex="-1"
										onpointerenter={() => hoveredRadarNode = { name: label.name, attendance: label.attendance, target: label.target, x: px, y: py, viewBox: 290 }}
										onfocus={() => hoveredRadarNode = { name: label.name, attendance: label.attendance, target: label.target, x: px, y: py, viewBox: 290 }}
									/>
									<!-- Visual dot -->
									<circle
										cx={px}
										cy={py}
										r="3"
										class="fill-primary stroke-card pointer-events-none"
										stroke-width="2"
									/>
								{/each}
								<!-- Labels -->
								{#each labels as label (label.name)}
									<text
										x={label.x}
										y={label.y}
										text-anchor={label.anchor}
										dominant-baseline="middle"
										font-size="9"
										class="fill-muted-foreground pointer-events-none"
										font-family="inherit"
									>{label.name}</text>
								{/each}
							</svg>

							<!-- Custom Tooltip -->
							{#if hoveredRadarNode && hoveredRadarNode.viewBox === 290}
								<div
									class="pointer-events-none absolute z-50 flex flex-col gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl text-popover-foreground transform -translate-x-1/2 -translate-y-[calc(100%+12px)] transition-all duration-200"
									style="left: {(hoveredRadarNode.x / 290) * 100}%; top: {(hoveredRadarNode.y / 290) * 100}%;"
								>
									<span class="font-semibold text-foreground">{hoveredRadarNode.name}</span>
									<div class="flex items-center justify-between gap-4">
										<div class="flex items-center gap-1.5">
											<div class="h-2 w-2 rounded-full bg-primary"></div>
											<span class="text-muted-foreground">Attendance</span>
										</div>
										<span class="font-mono tabular-nums font-medium">{hoveredRadarNode.attendance}</span>
									</div>
								</div>
							{/if}
						</div>
						<!-- Legend -->
						<div class="mt-3 grid w-full grid-cols-2 gap-x-3 gap-y-1.5 px-1">
							{#each stats.groupAttendance as group (group.name)}
								<div class="flex items-center justify-between text-xs">
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-primary"></div>
										<span class="text-muted-foreground">{group.name}</span>
									</div>
									<span class="font-semibold tabular-nums">{group.target > 0 ? Math.round((group.attendance / group.target) * 100) : 0}%</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-xs text-center text-muted-foreground py-4 italic">No group data available</p>
					{/if}
				</CardContent>
			</Card>

			<!-- Check-in Time Distribution -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base">Check-In Time Distribution</CardTitle>
				</CardHeader>
				<CardContent>
					{#if stats.hourlyData.length > 0}
						<ChartContainer config={barChartConfig} class="h-[200px] w-full">
							<BarChart 
								data={stats.hourlyData} 
								x="hour" 
								y="count" 
								series={[{ key: 'count', label: 'Check-ins' }]}
								props={{ 
									bars: { class: 'fill-primary' },
									tooltip: tooltipProps 
								}}
							/>
						</ChartContainer>
					{:else}
						<p class="text-xs text-center text-muted-foreground py-4 italic">
							No data available
						</p>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>

	<!-- Desktop View -->
	<div class="mx-auto hidden max-w-7xl flex-col gap-6 p-6 md:flex lg:p-8">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold">Analytics</h1>
				<p class="mt-1 text-muted-foreground">Attendance insights and trends</p>
			</div>
			<div class="flex items-center gap-4">
				<Select.Root type="single" value={selectedEventId} onValueChange={handleEventChange}>
					<Select.Trigger class="w-[280px]">
						{selectedEventName}
					</Select.Trigger>
					<Select.Content class="max-h-[300px] overflow-y-auto">
						<Select.Item value="all">Last Month</Select.Item>
						{#each eventsList as event (event.id)}
							<Select.Item value={event.id}>
								<div class="flex flex-col">
									<span class="font-medium">{event.name}</span>
									<span class="text-xs text-muted-foreground">{formatEventDate(event.date)}</span>
								</div>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				
				<Button variant="outline" onclick={() => void goto('/settings')}>
					<ChevronLeft class="mr-2 h-4 w-4" />
					Back to Settings
				</Button>
			</div>
		</div>

		<!-- Stats Grid -->
		<div class="grid grid-cols-4 gap-4">
			<Card>
				<CardContent class="p-6">
					<div class="mb-4 flex items-start justify-between">
						<div class="rounded-md bg-primary/10 p-3 text-primary">
							<Users class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.totalAttendance} / {stats.totalExpected}</div>
					<p class="mt-2 text-sm text-muted-foreground">Total Attendance</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-6">
					<div class="mb-4 flex items-start justify-between">
						<div class="rounded-md bg-green-500/10 p-3 text-green-500">
							<CheckCircle2 class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.attendanceRate}%</div>
					<p class="mt-2 text-sm text-muted-foreground">Attendance Rate</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-6">
					<div class="mb-4 flex items-start justify-between">
						<div class="rounded-md bg-blue-500/10 p-3 text-blue-500">
							<Clock class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.averageCheckInTime}</div>
					<p class="mt-2 text-sm text-muted-foreground">Avg Check-In</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-6">
					<div class="mb-4 flex items-start justify-between">
						<div class="rounded-md bg-purple-500/10 p-3 text-purple-500">
							<TrendingUp class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.activeMembers}</div>
					<p class="mt-2 text-sm text-muted-foreground">Total Members</p>
				</CardContent>
			</Card>
		</div>

		<div class="grid grid-cols-2 gap-6">
			<!-- Recent Events Trend -->
			<Card>
				<CardHeader>
					<CardTitle>Recent Events</CardTitle>
					<CardDescription>Attendance comparison for recent events</CardDescription>
				</CardHeader>
				<CardContent>
					{#if stats.weekTrend.length > 0}
						<ChartContainer config={lineChartConfig} class="h-[250px] w-full">
							<LineChart 
								data={stats.weekTrend} 
								x="day" 
								y="attendance" 
								series={[{ key: 'attendance', label: 'Attendance' }]}
								points={true}
								props={{ 
									spline: { class: 'stroke-primary stroke-2', curve: curveMonotoneX },
									points: { class: 'fill-primary stroke-card stroke-2', r: 4 },
									tooltip: tooltipProps 
								}}
							/>
						</ChartContainer>

						<!-- Event Legend -->
						<div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 pt-4 border-t text-sm">
							{#each stats.weekTrend as item, i (item.day)}
								<div class="flex items-center gap-3">
									<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 font-bold text-primary">
										{item.day.replace('E', '')}
									</div>
									<div class="flex flex-col overflow-hidden">
										<span class="truncate font-medium text-foreground">{item.name}</span>
										<span class="text-xs text-muted-foreground">{item.date}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="flex h-[250px] items-center justify-center">
							<p class="text-sm text-muted-foreground italic">No data available for recent events</p>
						</div>
					{/if}
				</CardContent>
			</Card>

			<!-- Group Performance Radar -->
			<Card>
				<CardHeader>
					<CardTitle>Attendance Distribution</CardTitle>
					<CardDescription>Share of total attendance by group</CardDescription>
				</CardHeader>
				<CardContent class="flex flex-col items-center pb-6">
					{#if stats.groupAttendance.length > 0}
						{@const CX = 175}
						{@const CY = 175}
						{@const R = 110}
						{@const RINGS = 4}
						{@const maxRatio = stats.groupAttendance.reduce((max, g) => Math.max(max, g.target > 0 ? g.attendance / g.target : 0), 0.1)}
						{@const radarScale = 1 / maxRatio}
						{@const labels = radarLabels(stats.groupAttendance, CX, CY, R)}
						{@const n = stats.groupAttendance.length}
						<div class="relative w-full max-w-[360px]">
							<svg role="application" viewBox="0 0 350 350" class="w-full overflow-visible" onpointerleave={() => hoveredRadarNode = null}>
								<!-- Grid rings -->
								{#each Array(RINGS) as _, ri (ri)}
									<polygon
										points={radarPoints(
											stats.groupAttendance.map((g) => ({ ...g, attendance: g.target * ((ri + 1) / RINGS) })),
											CX, CY, R, radarScale
										)}
										class="fill-none stroke-border"
										stroke-width="1"
									/>
								{/each}
								<!-- Axis lines -->
								{#each labels as label (label.name)}
									<line x1={CX} y1={CY} x2={label.lineX} y2={label.lineY} class="stroke-border" stroke-width="1" />
								{/each}
								<!-- Data polygon -->
								<polygon
									points={radarPoints(stats.groupAttendance, CX, CY, R, radarScale)}
									class="stroke-primary"
									style="fill: hsl(var(--primary) / 0.25)"
									stroke-width="2"
									stroke-linejoin="round"
								/>
								<!-- Data points & tooltips -->
								{#each labels as lbl, i (lbl.name)}
									{@const angle = (i / n) * 2 * Math.PI - Math.PI / 2}
									{@const ratio = lbl.target > 0 ? Math.min((lbl.attendance / lbl.target) * radarScale, 1) : 0}
									{@const px = CX + R * ratio * Math.cos(angle)}
									{@const py = CY + R * ratio * Math.sin(angle)}
									<!-- Hover target -->
									<circle
										cx={px}
										cy={py}
										r="18"
										class="fill-transparent outline-none cursor-pointer"
										role="graphics-symbol"
										tabindex="0"
										onpointerenter={() => hoveredRadarNode = { name: lbl.name, attendance: lbl.attendance, target: lbl.target, x: px, y: py, viewBox: 360 }}
										onfocus={() => hoveredRadarNode = { name: lbl.name, attendance: lbl.attendance, target: lbl.target, x: px, y: py, viewBox: 360 }}
									/>
									<!-- Visual dot -->
									<circle
										cx={px}
										cy={py}
										r="4"
										class="fill-primary stroke-card pointer-events-none"
										stroke-width="2"
									/>
								{/each}
								<!-- Labels -->
								{#each labels as lbl}
									<text
										x={lbl.x}
										y={lbl.y}
										text-anchor={lbl.anchor}
										dominant-baseline="middle"
										font-size="11"
										class="fill-muted-foreground pointer-events-none"
										font-family="inherit"
									>{lbl.name}</text>
								{/each}
							</svg>

							<!-- Custom Tooltip -->
							{#if hoveredRadarNode && hoveredRadarNode.viewBox === 360}
								<div
									class="pointer-events-none absolute z-50 flex flex-col gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-xl text-popover-foreground transform -translate-x-1/2 -translate-y-[calc(100%+14px)] transition-all duration-200"
									style="left: {(hoveredRadarNode.x / 360) * 100}%; top: {(hoveredRadarNode.y / 360) * 100}%;"
								>
									<span class="font-semibold text-foreground">{hoveredRadarNode.name}</span>
									<div class="flex items-center justify-between gap-4">
										<div class="flex items-center gap-2">
											<div class="h-2 w-2 rounded-full bg-primary"></div>
											<span class="text-muted-foreground">Attendance</span>
										</div>
										<span class="font-mono tabular-nums font-medium">{hoveredRadarNode.attendance}</span>
									</div>
								</div>
							{/if}
						</div>
						<!-- Legend below -->
						<div class="mt-2 grid w-full grid-cols-2 gap-x-6 gap-y-2 px-4">
							{#each stats.groupAttendance as group, i (group.name)}
								<div class="flex items-center justify-between text-sm">
									<div class="flex items-center gap-2">
										<div class="h-2.5 w-2.5 rounded-full bg-primary"></div>
										<span class="text-muted-foreground">{group.name}</span>
									</div>
									<span class="font-semibold tabular-nums">{group.target > 0 ? Math.round((group.attendance / group.target) * 100) : 0}%</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="py-8 text-center text-sm italic text-muted-foreground">No group data available</p>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Check-in Time Distribution -->
		<Card>
			<CardHeader>
				<CardTitle>Check-In Time Distribution</CardTitle>
				<CardDescription>When members typically check in throughout the day</CardDescription>
			</CardHeader>
			<CardContent>
				{#if stats.hourlyData.length > 0}
					<ChartContainer config={barChartConfig} class="h-[300px] w-full">
						<BarChart 
							data={stats.hourlyData} 
							x="hour" 
							y="count" 
							series={[{ key: 'count', label: 'Check-ins' }]}
							props={{ 
								bars: { class: 'fill-primary' },
								tooltip: tooltipProps 
							}}
						/>
					</ChartContainer>
				{:else}
					<div class="flex h-[300px] items-center justify-center">
						<p class="text-sm text-muted-foreground italic">No data available</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>
{/if}

<style>
	:global(body) {
		overflow-x: hidden;
	}
</style>

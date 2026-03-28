<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Search, Calendar, Filter, ChevronRight, Users, CheckCircle2 } from '@lucide/svelte';
	import {
		ChevronLeft,
		HelpCircle,
		MapPin,
		QrCode,
		Clock,
		FileText,
		ArrowRight,
		ScanLine,
		TrendingUp,
		X
	} from '@lucide/svelte';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import {
		Card,
		CardHeader,
		CardContent,
		CardFooter,
		CardTitle,
		CardDescription
	} from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { ArcChart, Text } from 'layerchart';
	import { formatTimeRange, formatLocalTime } from '$lib/utils/time';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuCheckboxItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import {
		Drawer,
		DrawerContent,
		DrawerHeader,
		DrawerTitle,
		DrawerTrigger,
		DrawerClose
	} from '$lib/components/ui/drawer';
	import { ScrollArea } from '$lib/components/ui/scroll';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import FullPageLoading from '$lib/components/full-page-loading.svelte';

	// State
	let events = $state<any[]>([]);
	let currentEvent = $state<any>(null);
	let recentScans = $state<any[]>([]);
	let isLoading = $state(true);
	let stats = $state({ present: 0, expected: 0 });
	let drawerOpen = $state(false);
	let query = $state('');

	onMount(async () => {
		isLoading = true;
		try {
			await Promise.all([fetchOngoingEvent(), fetchRecentEvents(), fetchRecentScans()]);
		} finally {
			isLoading = false;
		}
	});

	async function fetchOngoingEvent() {
		const { data } = await supabase
			.from('events')
			.select('*')
			.eq('status', 'ongoing')
			.limit(1)
			.maybeSingle();

		if (data) {
			const { count: presentCount } = await supabase
				.from('attendance_scans')
				.select('*', { count: 'exact', head: true })
				.eq('event_id', data.event_id);

			const { count: memberCount } = await supabase
				.from('members')
				.select('*', { count: 'exact', head: true });

			const start = new Date(data.start_datetime);
			const end = new Date(data.end_datetime);

			currentEvent = {
				id: data.event_id,
				name: data.event_name,
				date: data.event_date,
				time: await formatTimeRange(data.start_datetime, data.end_datetime),
				place: data.metadata?.location || 'Main Sanctuary'
			};
			stats = {
				present: presentCount || 0,
				expected: memberCount || 0
			};
		}
	}

	async function fetchRecentEvents() {
		const { data } = await supabase
			.from('events')
			.select('*')
			.eq('status', 'completed')
			.order('end_datetime', { ascending: false })
			.limit(10);

		if (data) {
			events = await Promise.all(
				data.map(async (e) => {
					const { count } = await supabase
						.from('attendance_present')
						.select('*', { count: 'exact', head: true })
						.eq('event_id', e.event_id);
					return {
						id: e.event_id,
						name: e.event_name,
						date: e.event_date,
						attendees: count || 0,
						status: 'Completed'
					};
				})
			);
		}
	}

	async function fetchRecentScans() {
		const { data } = await supabase
			.from('attendance_scans')
			.select('*, members(*)')
			.order('scan_datetime', { ascending: false });

		if (data) {
			recentScans = await Promise.all(
				data.map(async (s) => ({
					id: s.scan_id,
					name: s.members ? `${s.members.first_name} ${s.members.last_name}` : 'Unknown Member',
					role: s.members?.metadata?.role || 'Member',
					time: await formatLocalTime(s.scan_datetime),
					avatar: s.members
						? `https://api.dicebear.com/7.x/initials/svg?seed=${s.members.first_name}%20${s.members.last_name}`
						: 'https://api.dicebear.com/7.x/initials/svg?seed=U'
				}))
			);
		}
	}

	let filteredEvents = $derived(
		events.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
	);

	// Chart calculations
	let participationRate = $derived(
		stats.expected > 0 ? Math.round((stats.present / stats.expected) * 100) : 0
	);
	let sessionProgressData = $derived([{ label: 'participation', value: participationRate }]);
	const chartConfig = {
		participation: { label: 'Participation', color: 'var(--color-primary)' }
	} satisfies Chart.ChartConfig;
</script>

{#if isLoading}
	<FullPageLoading message="Synchronizing attendance data..." />
{:else}
	<!-- Mobile View -->
	<div class="flex flex-col gap-4 p-4 pb-28 md:hidden">
		<!-- Live Session Card -->
		{#if currentEvent}
			<div class="space-y-4 rounded-2xl border border-border/40 bg-card p-4 shadow-sm">
				<div class="flex items-start justify-between">
					<div class="space-y-1">
						<div class="flex items-center gap-2">
							<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-(--color-primary)"
							></span>
							<div class="text-xs font-black tracking-widest text-(--color-primary) uppercase">
								Live Session
							</div>
						</div>
						<div class="text-xl font-extrabold tracking-tight">{currentEvent.name}</div>
						<div class="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
							<MapPin class="h-4 w-4" />
							<span>{currentEvent.place}</span>
						</div>
					</div>
					<div class="text-right text-xs text-muted-foreground">
						<div class="tracking-widest uppercase">Time</div>
						<div class="font-bold">{currentEvent.time}</div>
					</div>
				</div>
				<div class="flex items-center justify-between border-t border-border/20 pt-3">
					<div></div>
					<Drawer bind:open={drawerOpen}>
						<DrawerTrigger>
							<Button variant="outline" size="sm" class="uppercase"
								>Details &nbsp; <ChevronRight class="h-3 w-3" /></Button
							>
						</DrawerTrigger>
						<DrawerContent>
							<DrawerHeader class="flex flex-row items-center justify-between">
								<DrawerTitle>Event Details</DrawerTitle>
								<Button
									variant="ghost"
									size="sm"
									class="h-8 w-8 p-0"
									onclick={() => (drawerOpen = false)}
								>
									<X class="h-4 w-4" />
								</Button>
							</DrawerHeader>
							<div class="space-y-4 px-4 pb-4">
								<div>
									<h4
										class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
									>
										<FileText class="h-4 w-4" />
										Event Name
									</h4>
									<p class="mt-1 text-lg font-bold">{currentEvent.name}</p>
								</div>
								<div>
									<h4
										class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
									>
										<Calendar class="h-4 w-4" />
										Date
									</h4>
									<p class="mt-1 text-base">{currentEvent.date || currentEvent.day}</p>
								</div>
								<div>
									<h4
										class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
									>
										<Clock class="h-4 w-4" />
										Time
									</h4>
									<p class="mt-1 text-base">{currentEvent.time}</p>
								</div>
								<div>
									<h4
										class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
									>
										<MapPin class="h-4 w-4" />
										Place
									</h4>
									<p class="mt-1 text-base">{currentEvent.place}</p>
								</div>
							</div>
						</DrawerContent>
					</Drawer>
				</div>
			</div>

			<!-- Session Progress -->
			<div class="rounded-2xl border border-border/40 bg-card p-4 shadow-sm">
				<div class="flex items-start justify-between">
					<div>
						<div class="flex items-center gap-2 text-sm font-medium">
							<TrendingUp class="h-4 w-4" />
							Session Progress
						</div>
						<div class="mt-1 text-xs text-muted-foreground">Live Updates</div>
					</div>
				</div>
				<div class="mt-4 flex items-center gap-4">
					<!-- Radial Chart Progress -->
					<div class="w-32">
						<Chart.Container config={chartConfig} class="aspect-square">
							<ArcChart
								label="label"
								value="value"
								outerRadius={52}
								innerRadius={40}
								trackOuterRadius={50}
								trackInnerRadius={42}
								padding={15}
								range={[0, 360]}
								maxValue={100}
								series={sessionProgressData.map((d) => ({
									key: d.label,
									color: 'var(--color-primary)',
									data: [d]
								}))}
								props={{
									arc: { track: { fill: 'var(--muted)' }, motion: 'tween' },
									tooltip: { context: { hideDelay: 350 } }
								}}
								tooltip={false}
							>
								{#snippet belowMarks()}
									<circle cx="0" cy="0" r="42" class="fill-background" />
								{/snippet}
								{#snippet aboveMarks()}
									<Text
										value={`${participationRate}%`}
										textAnchor="middle"
										verticalAnchor="middle"
										class="fill-foreground text-2xl! font-bold"
										dy={2}
									/>
								{/snippet}
							</ArcChart>
						</Chart.Container>
					</div>

					<div class="flex-1">
						<div class="text-xs tracking-widest text-muted-foreground uppercase">Participation</div>
						<div class="mt-2 text-lg font-bold text-(--color-primary)">{participationRate}%</div>
						<div class="mt-3 text-xs text-muted-foreground">
							{stats.present} / {stats.expected} Checked In
						</div>
					</div>
				</div>
			</div>

			<!-- Small stats -->
			<div class="grid grid-cols-2 gap-3">
				<div class="rounded-2xl border border-border/40 bg-card p-4 shadow-sm">
					<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
						<CheckCircle2 class="h-4 w-4 text-(--stat-success)" />
						<div class="tracking-widest uppercase">Checked In</div>
					</div>
					<div class="mt-2 text-2xl font-extrabold">{stats.present}</div>
				</div>
				<div class="rounded-2xl border border-border/40 bg-card p-4 shadow-sm">
					<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
						<Users class="h-4 w-4 text-(--color-primary)" />
						<div class="tracking-widest uppercase">Expected</div>
					</div>
					<div class="mt-2 text-2xl font-extrabold">{stats.expected}</div>
				</div>
			</div>
		{:else}
			<Card class="border-2 border-dashed bg-muted/30">
				<CardContent class="flex flex-col items-center justify-center space-y-3 p-8 text-center">
					<Calendar class="h-10 w-10 text-muted-foreground opacity-20" />
					<div class="font-bold">No Live Session</div>
					<p class="text-xs text-muted-foreground">
						There are no ongoing events at the moment. Active events will appear here.
					</p>
				</CardContent>
			</Card>
		{/if}

		<!-- Recent Scans -->
		<div class="mt-4 flex items-center justify-between">
			<h3 class="flex items-center gap-2 text-lg font-bold">
				<ScanLine class="h-5 w-5" />
				Recent Scans
			</h3>
			<Button
				variant="ghost"
				size="sm"
				class="flex h-auto items-center gap-1 p-0 text-xs font-bold text-(--color-primary)"
				onclick={() => goto('/attendance/all-scans')}
			>
				VIEW ALL
				<ArrowRight class="h-3 w-3" />
			</Button>
		</div>

		<div class="space-y-3">
			{#if recentScans.length > 0}
				{#each recentScans as scan}
					<div
						class="flex items-center justify-between rounded-2xl border border-border/40 bg-card p-4 shadow-sm"
					>
						<div class="flex items-center gap-3">
							<Avatar class="h-10 w-10 rounded-full">
								<AvatarImage src={scan.avatar} alt={scan.name} />
								<AvatarFallback>{scan.name.charAt(0)}</AvatarFallback>
							</Avatar>
							<div>
								<div class="font-bold">{scan.name}</div>
								<div class="text-xs text-muted-foreground">{scan.role}</div>
							</div>
						</div>
						<div class="flex items-center gap-2 text-xs text-muted-foreground">
							<div>{scan.time}</div>
							<span class="h-2 w-2 rounded-full bg-(--stat-success)"></span>
						</div>
					</div>
				{/each}
			{:else}
				<div class="p-8 text-center text-sm text-muted-foreground italic">
					No recent scans found.
				</div>
			{/if}
		</div>
	</div>

	<!-- Desktop View -->
	<div class="hidden h-[calc(100vh-120px)] gap-8 p-8 md:flex lg:p-10">
		<!-- Left / Main -->
		<ScrollArea className="flex-1 h-full">
			<div class="space-y-8 pr-6">
				{#if currentEvent}
					<Card>
						<CardContent class="p-6">
							<div class="flex items-start justify-between">
								<div class="space-y-1">
									<div
										class="flex items-center gap-2 text-[10px] font-black tracking-widest text-(--color-primary) uppercase"
									>
										<span class="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
										LIVE SESSION
									</div>
									<h3 class="text-2xl font-extrabold tracking-tight">{currentEvent.name}</h3>
									<div class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
										<MapPin class="h-4 w-4" />
										{currentEvent.place}
									</div>
								</div>
								<div class="text-right">
									<div class="text-sm font-bold">{currentEvent.time}</div>
									<div class="mt-1 text-xs tracking-widest text-muted-foreground uppercase">
										Time
									</div>
									<div class="mt-4">
										<Popover>
											<PopoverTrigger>
												<Button variant="outline" size="sm"
													>Details &nbsp; <ChevronRight class="h-3 w-3" /></Button
												>
											</PopoverTrigger>
											<PopoverContent class="w-80">
												<div class="space-y-3">
													<div>
														<h4
															class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
														>
															<FileText class="h-4 w-4" />
															Event Name
														</h4>
														<p class="text-lg font-bold">{currentEvent.name}</p>
													</div>
													<div>
														<h4
															class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
														>
															<Calendar class="h-4 w-4" />
															Date
														</h4>
														<p class="text-base">{currentEvent.date || currentEvent.day}</p>
													</div>
													<div>
														<h4
															class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
														>
															<Clock class="h-4 w-4" />
															Time
														</h4>
														<p class="text-base">{currentEvent.time}</p>
													</div>
													<div>
														<h4
															class="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
														>
															<MapPin class="h-4 w-4" />
															Place
														</h4>
														<p class="text-base">{currentEvent.place}</p>
													</div>
												</div>
											</PopoverContent>
										</Popover>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardContent class="flex items-center gap-6 p-6">
							<div class="w-44">
								<Chart.Container config={chartConfig} class="aspect-square">
									<ArcChart
										label="label"
										value="value"
										outerRadius={72}
										innerRadius={55}
										trackOuterRadius={70}
										trackInnerRadius={58}
										padding={20}
										range={[0, 360]}
										maxValue={100}
										series={sessionProgressData.map((d) => ({
											key: d.label,
											color: 'var(--color-primary)',
											data: [d]
										}))}
										props={{
											arc: { track: { fill: 'var(--muted)' }, motion: 'tween' },
											tooltip: { context: { hideDelay: 350 } }
										}}
										tooltip={false}
									>
										{#snippet belowMarks()}
											<circle cx="0" cy="0" r="55" class="fill-background" />
										{/snippet}
										{#snippet aboveMarks()}
											<Text
												value={`${participationRate}%`}
												textAnchor="middle"
												verticalAnchor="middle"
												class="fill-foreground text-3xl! font-bold"
												dy={3}
											/>
										{/snippet}
									</ArcChart>
								</Chart.Container>
							</div>
							<div class="flex-1">
								<div class="flex items-center justify-between">
									<div>
										<div class="flex items-center gap-2 text-sm font-medium">
											<TrendingUp class="h-4 w-4" />
											Session Progress
										</div>
										<div class="mt-1 text-xs text-muted-foreground">Live Updates</div>
									</div>
									<div class="text-sm text-muted-foreground">
										<div class="text-xs font-bold">{stats.present} / {stats.expected}</div>
										<div class="text-right text-[10px] tracking-tighter uppercase">Attending</div>
									</div>
								</div>

								<div class="mt-6">
									<div class="text-xs tracking-widest text-muted-foreground uppercase">
										Overall Participation
									</div>
									<div class="mt-1 text-3xl font-bold text-(--color-primary)">
										{participationRate}%
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<div class="grid grid-cols-2 gap-4">
						<Card class="p-0">
							<CardContent class="p-4">
								<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
									<CheckCircle2 class="h-4 w-4 text-(--stat-success)" />
									<div class="tracking-widest uppercase">Checked In</div>
								</div>
								<div class="mt-2 text-2xl font-extrabold">{stats.present}</div>
							</CardContent>
						</Card>

						<Card class="p-0">
							<CardContent class="p-4">
								<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
									<Users class="h-4 w-4 text-(--color-primary)" />
									<div class="tracking-widest uppercase">Expected</div>
								</div>
								<div class="mt-2 text-2xl font-extrabold">{stats.expected}</div>
							</CardContent>
						</Card>
					</div>
				{:else}
					<Card class="w-full border-2 border-dashed bg-muted/30 p-12">
						<CardContent class="flex flex-col items-center justify-center space-y-4 text-center">
							<div class="rounded-full bg-muted p-4">
								<Calendar class="h-12 w-12 text-muted-foreground opacity-30" />
							</div>
							<div>
								<h3 class="text-xl font-bold">No Ongoing Events</h3>
								<p class="mx-auto mt-2 max-w-md text-muted-foreground">
									There are no live sessions currently active. Start or schedule an event from the
									Events Management page to see live attendance tracking.
								</p>
							</div>
							<Button variant="outline" onclick={() => goto('/events')}>Go to Events</Button>
						</CardContent>
					</Card>
				{/if}

				<div class="mt-8 flex items-center justify-between border-b pb-2">
					<h3 class="text-xl font-bold tracking-tight">Recent Sessions</h3>
					<a href="/attendance/history" class="text-sm font-bold text-primary hover:underline"
						>View History</a
					>
				</div>

				<div class="mt-4 grid grid-cols-2 gap-4">
					{#each events.slice(0, 4) as e}
						<Card
							class="cursor-pointer transition-colors hover:border-primary/50"
							onclick={() => goto(`/attendance/history?event=${e.id}`)}
						>
							<CardContent class="p-4">
								<div class="flex items-start justify-between">
									<div class="min-w-0">
										<div class="mb-1 text-xs font-medium text-muted-foreground uppercase">
											{new Date(e.date).toLocaleDateString()}
										</div>
										<h4 class="truncate font-bold">{e.name}</h4>
									</div>
									<Badge variant="secondary" class="font-bold">{e.attendees}</Badge>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			</div>
		</ScrollArea>

		<!-- Right / Sidebar -->
		<aside class="flex h-full w-96 shrink-0 flex-col gap-6 overflow-hidden">
			<Card class="flex h-full max-h-[calc(100vh-150px)] flex-1 flex-col overflow-hidden">
				<CardHeader class="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle class="flex items-center gap-2">
							<ScanLine class="h-5 w-5" />
							Recent Scans
						</CardTitle>
						<CardDescription>Latest check-ins</CardDescription>
					</div>
				</CardHeader>
				<ScrollArea className="flex-1">
					<div class="space-y-3 p-4">
						{#if recentScans.length > 0}
							{#each recentScans as scan}
								<div
									class="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
								>
									<Avatar class="h-10 w-10 border border-border/50">
										<AvatarImage src={scan.avatar} alt={scan.name} />
										<AvatarFallback>{scan.name.charAt(0)}</AvatarFallback>
									</Avatar>
									<div class="min-w-0 flex-1">
										<div class="truncate text-sm font-bold tracking-tight uppercase">
											{scan.name}
										</div>
										<div class="text-[10px] text-muted-foreground uppercase">{scan.role}</div>
									</div>
									<div class="text-[10px] font-bold text-muted-foreground">{scan.time}</div>
								</div>
							{/each}
						{:else}
							<div
								class="flex h-full flex-col items-center justify-center p-12 text-sm italic opacity-20"
							>
								<ScanLine class="mb-2 h-12 w-12" />
								No scans yet
							</div>
						{/if}
					</div>
				</ScrollArea>
				<CardFooter class="border-t p-4">
					<Button
						class="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20"
						onclick={() => goto('/scan')}
					>
						<QrCode class="mr-2 h-4 w-4" />
						Open Scanner
					</Button>
				</CardFooter>
			</Card>
		</aside>
	</div>
{/if}

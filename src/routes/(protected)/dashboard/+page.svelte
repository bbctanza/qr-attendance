<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription,
		CardFooter
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import {
		QrCode,
		Users,
		UserCheck,
		UserX,
		Calendar,
		ArrowUpRight,
		Plus,
		UserPlus
	} from '@lucide/svelte';
	import { automation } from '$lib/logic/automation';
	import { onMount, onDestroy } from 'svelte';
	import * as Table from '$lib/components/ui/table';
	import { supabase } from '$lib/supabase';
	import type { AttendanceEvent } from '$lib/types';
	import FullPageLoading from '$lib/components/full-page-loading.svelte';

	import { devTools } from '$lib/stores/dev';

	// State
	let liveEvent = $state<any>(null);
	let stats = $state({
		total: 0,
		present: 0,
		absent: 0
	});
	let recentEvents = $state<any[]>([]);
	let isLoading = $state(true);

	// Start automation on mount (client-side only logic for now)
	onMount(() => {
		automation.start();
		fetchDashboardData();

		// Subscribe to devTools changes to auto-refresh dashboard
		const unsubscribe = devTools.subscribe(() => {
			// Debounce slightly to allow backend trigger to finish if it happened simultaneously
			setTimeout(fetchDashboardData, 500);
		});

		return () => {
			automation.stop(); // Cleanup
			unsubscribe();
		};
	});

	async function fetchDashboardData() {
		try {
			// 1. Total Members
			const { count: totalCount, error: memberError } = await supabase
				.from('members')
				.select('*', { count: 'exact', head: true });

			if (memberError) console.error('Error fetching members:', memberError);
			const total = totalCount || 0;

			// 2. Latest Event (Prioritize Ongoing/Upcoming, then fallback to last Completed)
			let currentEventData = null;

			// Trigger status refresh with mock time if needed
			const mockTime = $devTools.isMockTimeActive && $devTools.mockTime ? $devTools.mockTime : null;
			if (mockTime) {
				// Adjust to local time string for naive TIMESTAMP
				const offset = mockTime.getTimezoneOffset() * 60000;
				const localIso = new Date(mockTime.getTime() - offset).toISOString().slice(0, -1);
				await supabase.rpc('update_event_statuses', { p_now: localIso });
			} else {
				await supabase.rpc('update_event_statuses');
			}

			// Try active first
			const { data: activeEvents } = await supabase
				.from('events')
				.select('*')
				.eq('status', 'ongoing')
				.limit(1);

			if (activeEvents && activeEvents.length > 0) {
				currentEventData = activeEvents[0];
			}

			// 3. Process Live/Current Event
			let present = 0;
			if (currentEventData) {
				// Get attendance for this event
				// Note: using attendance_scans for migration data compatibility
				const { count: scanCount } = await supabase
					.from('attendance_scans')
					.select('*', { count: 'exact', head: true })
					.eq('event_id', currentEventData.event_id);

				present = scanCount || 0;

				// Format time
				const start = new Date(currentEventData.start_datetime);
				const end = new Date(currentEventData.end_datetime);
				const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

				liveEvent = {
					id: currentEventData.event_id.toString(),
					title: currentEventData.event_name,
					location: (currentEventData.metadata as any)?.location || 'Main Sanctuary',
					time: timeStr,
					isActive: currentEventData.status === 'ongoing' || currentEventData.status === 'upcoming', // Show as 'Active' context
					status: currentEventData.status
				};
			} else {
				liveEvent = null;
			}

			stats = {
				total,
				present,
				absent: total - present
			};

			// 4. Recent Events List
			const { data: historyEvents } = await supabase
				.from('events')
				.select('*')
				.eq('status', 'completed')
				.neq('event_id', currentEventData?.event_id || -1) // Exclude the one shown in main card if it is completed
				.order('end_datetime', { ascending: false })
				.limit(4);

			if (historyEvents) {
				recentEvents = await Promise.all(
					historyEvents.map(async (ev) => {
						// Get count
						const { count: evCount } = await supabase
							.from('attendance_scans')
							.select('*', { count: 'exact', head: true })
							.eq('event_id', ev.event_id);

						const p = evCount || 0;
						// Use current total for rate approximation (historical total is harder)
						const rate = total > 0 ? Math.round((p / total) * 100) : 0;

						const d = new Date(ev.event_date);
						const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

						return {
							name: ev.event_name,
							date: dateStr,
							rate,
							status: ev.status
						};
					})
				);
			}
		} catch (err) {
			console.error('Dashboard data load failed:', err);
		} finally {
			isLoading = false;
		}
	}

	function getRateColor(rate: number) {
		if (rate >= 90) return 'bg-green-500/10 text-green-500 border-green-500/20';
		if (rate >= 75) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
		return 'bg-red-500/10 text-red-500 border-red-500/20';
	}
</script>

{#if isLoading}
	<FullPageLoading message="Loading dashboard..." />
{:else}
	<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
		<!-- Top Header / Quick Actions for Mobile -->
		<div class="flex items-center justify-end space-y-2">
			<div class="flex items-center space-x-2">
				<Button
					size="sm"
					class="hidden bg-primary text-primary-foreground hover:bg-primary/90 md:flex"
				>
					<Plus class="mr-2 h-4 w-4" /> New Event
				</Button>
			</div>
		</div>

		<!-- Live Event Card (Banner Style) -->
		<Card
			class="relative min-h-50 overflow-hidden border-border bg-linear-to-br from-card to-card/50 shadow-lg"
		>
			<!-- Decoration background -->
			<div class="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"></div>

			{#if liveEvent}
				<CardHeader class="pb-2">
					<div class="flex items-center justify-between">
						<Badge
							variant="outline"
							class="animate-pulse border-primary/50 bg-primary/10 text-primary"
						>
							<span class="mr-1.5 flex h-2 w-2 rounded-full bg-primary"></span>
							{liveEvent.isActive ? 'LIVE EVENT' : 'LATEST EVENT'}
						</Badge>
						<span class="font-mono text-xs text-muted-foreground">ID: #{liveEvent.id}</span>
					</div>
					<CardTitle class="mt-2 text-2xl md:text-3xl">{liveEvent.title}</CardTitle>
					<CardDescription class="mt-1 flex items-center text-sm md:text-base">
						{liveEvent.location} • {liveEvent.time}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="mt-4">
						<Button
							size="lg"
							class="w-full bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 md:w-auto"
							href="/scan"
						>
							<QrCode class="mr-2 h-5 w-5" />
							Scan Attendees
						</Button>
					</div>
				</CardContent>
			{:else if isLoading}
				<CardHeader class="pb-2">
					<div class="h-6 w-32 animate-pulse rounded bg-muted"></div>
					<div class="mt-4 h-10 w-3/4 animate-pulse rounded bg-muted"></div>
					<div class="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted"></div>
				</CardHeader>
			{:else}
				<CardHeader class="pb-2">
					<div class="flex items-center justify-between">
						<Badge variant="outline" class="text-muted-foreground">NO ACTIVE EVENT</Badge>
					</div>
					<CardTitle class="mt-2 text-2xl md:text-3xl">No Event Scheduled</CardTitle>
					<CardDescription class="mt-1">
						There are no upcoming events scheduled for today.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="mt-4">
						<Button size="lg" class="w-full md:w-auto" href="/events">
							<Calendar class="mr-2 h-5 w-5" />
							Manage Events
						</Button>
					</div>
				</CardContent>
			{/if}
		</Card>

		<!-- Stats Grid -->
		<div class="grid gap-4 md:grid-cols-3">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Total Expected</CardTitle>
					<Users class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">{stats.total}</div>
					<p class="text-xs text-muted-foreground">Registered members</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Present</CardTitle>
					<UserCheck class="h-4 w-4 text-green-500" />
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold text-green-500">{stats.present}</div>
					<div class="mt-1 h-1 w-full rounded-full bg-secondary">
						<div
							class="h-1 rounded-full bg-green-500"
							style="width: {stats.total > 0 ? (stats.present / stats.total) * 100 : 0}%"
						></div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Absent</CardTitle>
					<UserX class="h-4 w-4 text-red-500" />
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold text-red-500">{stats.absent}</div>
					<div class="mt-1 h-1 w-full rounded-full bg-secondary">
						<div
							class="h-1 rounded-full bg-red-500"
							style="width: {stats.total > 0 ? (stats.absent / stats.total) * 100 : 0}%"
						></div>
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Recent History & Quick Actions -->
		<div class="grid gap-4 md:grid-cols-7 lg:grid-cols-8">
			<!-- Recent History Table -->
			<Card class="col-span-1 md:col-span-4 lg:col-span-5">
				<CardHeader class="flex flex-row items-center">
					<div class="grid gap-1">
						<CardTitle>Recent History</CardTitle>
						<CardDescription>Attendance from previous sessions.</CardDescription>
					</div>
					<Button variant="ghost" size="sm" class="ml-auto gap-1 text-primary">
						View All <ArrowUpRight class="h-4 w-4" />
					</Button>
				</CardHeader>
				<CardContent>
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Event Name</Table.Head>
								<Table.Head class="text-right">Date</Table.Head>
								<Table.Head class="text-right">Rate</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each recentEvents as event}
								<Table.Row>
									<Table.Cell>
										<div class="font-medium">{event.name}</div>
									</Table.Cell>
									<Table.Cell class="text-right text-muted-foreground">{event.date}</Table.Cell>
									<Table.Cell class="text-right">
										<Badge variant="outline" class={getRateColor(event.rate)}>
											{event.rate}%
										</Badge>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</CardContent>
			</Card>

			<!-- Quick Actions Cards -->
			<div class="col-span-1 grid gap-4 md:col-span-3 lg:col-span-3">
				<Card
					class="flex cursor-pointer flex-col justify-center border-dashed bg-secondary/20 transition-colors hover:bg-secondary/40"
				>
					<CardHeader class="items-center pb-2">
						<div
							class="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary"
						>
							<Plus class="h-6 w-6" />
						</div>
						<CardTitle class="text-lg">New Event</CardTitle>
					</CardHeader>
					<CardFooter class="justify-center pb-6 text-sm text-muted-foreground">
						Create a custom session
					</CardFooter>
				</Card>

				<Card
					class="flex cursor-pointer flex-col justify-center border-dashed bg-secondary/20 transition-colors hover:bg-secondary/40"
				>
					<CardHeader class="items-center pb-2">
						<div
							class="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20 text-purple-500"
						>
							<UserPlus class="h-6 w-6" />
						</div>
						<CardTitle class="text-lg">Add Member</CardTitle>
					</CardHeader>
					<CardFooter class="justify-center pb-6 text-sm text-muted-foreground">
						Register new user
					</CardFooter>
				</Card>
			</div>
		</div>
	</div>
{/if}

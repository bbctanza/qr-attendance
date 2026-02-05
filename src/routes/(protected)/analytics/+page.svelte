<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { ChevronLeft, TrendingUp, Users, Clock, CheckCircle2 } from "@lucide/svelte";
	import { goto } from "$app/navigation";
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import FullPageLoading from "$lib/components/full-page-loading.svelte";
	import { ensureUTC } from '$lib/utils/time';
	import { systemSettings } from '$lib/stores/settings';
	import { get } from 'svelte/store';

	// Analytics state
	let stats = $state({
		totalAttendance: 0,
		attendanceRate: 0,
		averageCheckInTime: "--:--",
		activeMembers: 0,
		weekTrend: [] as { day: string, attendance: number, target: number }[],
		groupAttendance: [] as { name: string, attendance: number, target: number }[],
		hourlyData: [] as { hour: string, count: number }[]
	});

	let isLoading = $state(true);

	onMount(async () => {
		isLoading = true;
		try {
			await fetchAnalytics();
		} finally {
			isLoading = false;
		}
	});

	async function fetchAnalytics() {
		// 1. Total Attendance (Historical)
		const { count: totalPresent } = await supabase
			.from('attendance_present')
			.select('*', { count: 'exact', head: true });

		// 2. Active Members
		const { count: memberCount } = await supabase
			.from('members')
			.select('*', { count: 'exact', head: true });

		// 3. Attendance Rate (Overall)
		// We need to know how many events were completed and how many people were expected
		const { data: events } = await supabase
			.from('events')
			.select('event_id')
			.eq('status', 'completed');
		
		const completedEventCount = events?.length || 0;
		const totalExpected = completedEventCount * (memberCount || 0);
		const rate = totalExpected > 0 ? Math.round(((totalPresent || 0) / totalExpected) * 100) : 0;

		// 4. Group Attendance
		const { data: groups } = await supabase
			.from('groups')
			.select('group_id, name, group_code');
		
		const groupData = await Promise.all((groups || []).map(async (g) => {
			const { count: gPresent } = await supabase
				.from('attendance_present')
				.select('*, members!inner(group_id)', { count: 'exact', head: true })
				.eq('members.group_id', g.group_id);
			
			const { count: gTotal } = await supabase
				.from('members')
				.select('*', { count: 'exact', head: true })
				.eq('group_id', g.group_id);
			
			return {
				name: g.name || g.group_code,
				attendance: (gPresent || 0),
				target: (gTotal || 0) * completedEventCount
			};
		}));

		// 5. Weekly Trend (Last 7 days)
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const today = new Date();
		const weeklyTrend = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(today.getDate() - i);
			const dateStr = d.toISOString().split('T')[0];
			
			const { count } = await supabase
				.from('attendance_present')
				.select('*', { count: 'exact', head: true })
				.gte('scan_datetime', `${dateStr}T00:00:00`)
				.lte('scan_datetime', `${dateStr}T23:59:59`);
			
			weeklyTrend.push({
				day: days[d.getDay()],
				attendance: count || 0,
				target: memberCount || 0
			});
		}

		// 6. Average Check-in Time & Hourly Distribution
		const { data: recentScans } = await supabase
			.from('attendance_present')
			.select('scan_datetime');
		
		let avgTimeStr = "--:--";
		const hourlyCount = new Array(24).fill(0);
		
		// Get user's timezone for proper time conversion
		let userTimezone = 'Asia/Manila';
		try {
			const settings = get(systemSettings);
			if (settings?.timezone) {
				userTimezone = settings.timezone;
			} else {
				// Try to fetch from database if not in store
				const { data } = await supabase
					.from('system_settings')
					.select('timezone')
					.eq('id', 1)
					.single();
				if (data?.timezone) {
					userTimezone = data.timezone;
				}
			}
		} catch {
			// Use default timezone
		}
		
		if (recentScans && recentScans.length > 0) {
			const totalMinutes = recentScans.reduce((acc, s) => {
				// Convert database datetime to UTC ISO format, then to user's timezone
				const utcDateStr = ensureUTC(s.scan_datetime);
				const utcDate = new Date(utcDateStr);
				
				// Get the hour in user's timezone
				const formatter = new Intl.DateTimeFormat('en-US', {
					hour: 'numeric',
					hour12: false,
					timeZone: userTimezone
				});
				const parts = formatter.formatToParts(utcDate);
				const hourInUserTz = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
				
				hourlyCount[hourInUserTz]++;
				return acc + (hourInUserTz * 60) + utcDate.getUTCMinutes();
			}, 0);
			const avgMinutes = Math.round(totalMinutes / recentScans.length);
			const hours = Math.floor(avgMinutes / 60);
			const minutes = avgMinutes % 60;
			
			// Format using global time format setting (12h or 24h)
			const use12HourFormat = typeof localStorage !== 'undefined' && localStorage.getItem('time_format') === '12h';
			if (use12HourFormat) {
				const displayHours = hours % 12 || 12;
				const period = hours >= 12 ? 'PM' : 'AM';
				avgTimeStr = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
			} else {
				avgTimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
			}
		}

		// Convert hourly count to display format (6 AM - 6 PM)
		const hourlyData = [];
		const hourLabels = ['6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];
		for (let i = 6; i <= 18; i++) {
			hourlyData.push({
				hour: hourLabels[i - 6],
				count: hourlyCount[i]
			});
		}

		stats = {
			totalAttendance: totalPresent || 0,
			attendanceRate: rate,
			averageCheckInTime: avgTimeStr,
			activeMembers: memberCount || 0,
			weekTrend: weeklyTrend,
			groupAttendance: groupData.filter(g => g.target > 0),
			hourlyData: hourlyData
		};
	}
</script>

{#if isLoading}
	<FullPageLoading message="Generating analytics reports..." />
{:else}
	<!-- Mobile View -->
	<div class="md:hidden flex flex-col min-h-screen bg-background pb-20">
	<!-- Header -->
	<div class="hidden sm:flex sticky top-0 bg-background border-b border-border/10 z-10">
		<div class="flex items-center gap-3 px-4 py-4 w-full">
			<button onclick={() => goto('/settings')} class="p-2 hover:bg-muted rounded-lg transition shrink-0">
				<ChevronLeft class="h-5 w-5" />
			</button>
			<div class="min-w-0 flex-1">
				<h1 class="text-xl font-bold">Analytics</h1>
				<p class="text-xs text-muted-foreground">Attendance insights</p>
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 px-4 py-6 space-y-6">
			<!-- Stats Grid -->
			<div class="grid grid-cols-2 gap-3">
				<Card>
					<CardContent class="p-4">
						<div class="flex items-start justify-between mb-3">
							<div class="p-2 rounded-md bg-primary/10 text-primary">
								<Users class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.totalAttendance}</div>
						<p class="text-xs text-muted-foreground mt-1">Total Attendance</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent class="p-4">
						<div class="flex items-start justify-between mb-3">
							<div class="p-2 rounded-md bg-green-500/10 text-green-500">
								<CheckCircle2 class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.attendanceRate}%</div>
						<p class="text-xs text-muted-foreground mt-1">Attendance Rate</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent class="p-4">
						<div class="flex items-start justify-between mb-3">
							<div class="p-2 rounded-md bg-blue-500/10 text-blue-500">
								<Clock class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.averageCheckInTime}</div>
						<p class="text-xs text-muted-foreground mt-1">Avg Check-In</p>
					</CardContent>
				</Card>

				<Card>
					<CardContent class="p-4">
						<div class="flex items-start justify-between mb-3">
							<div class="p-2 rounded-md bg-purple-500/10 text-purple-500">
								<TrendingUp class="h-4 w-4" />
							</div>
						</div>
						<div class="text-2xl font-bold">{stats.activeMembers}</div>
						<p class="text-xs text-muted-foreground mt-1">Total Members</p>
					</CardContent>
				</Card>
			</div>

			<!-- Weekly Trend -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base">Weekly Attendance Trend</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="space-y-3">
						{#each stats.weekTrend as item}
							<div>
								<div class="flex items-center justify-between mb-1">
									<span class="text-xs font-medium">{item.day}</span>
									<span class="text-xs text-muted-foreground">{item.attendance}/{item.target}</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2 overflow-hidden">
									<div 
										class="bg-primary h-full rounded-full transition-all"
										style="width: {item.target > 0 ? (item.attendance / item.target) * 100 : 0}%"
									></div>
								</div>
							</div>
						{:else}
							<p class="text-xs text-center text-muted-foreground py-4 italic">No data for the last 7 days</p>
						{/each}
					</div>
				</CardContent>
			</Card>

			<!-- Group Performance -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base">Group Performance</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="space-y-3">
						{#each stats.groupAttendance as group}
							<div class="flex items-center justify-between p-3 rounded-lg bg-card/50">
								<div class="min-w-0 flex-1">
									<p class="text-xs font-bold text-muted-foreground uppercase">{group.name}</p>
									<div class="flex items-center gap-2 mt-1">
										<div class="flex-1 bg-muted rounded-full h-1.5">
											<div 
												class="bg-primary h-full rounded-full"
												style="width: {group.target > 0 ? (group.attendance / group.target) * 100 : 0}%"
											></div>
										</div>
										<span class="text-xs font-bold min-w-fit">{group.attendance}/{group.target}</span>
									</div>
								</div>
							</div>
						{:else}
							<p class="text-xs text-center text-muted-foreground py-4 italic">No group data available</p>
						{/each}
					</div>
				</CardContent>
			</Card>

			<!-- Check-in Time Distribution -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base">Check-In Time Distribution</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="space-y-3">
						{#each stats.hourlyData as item}
							<div>
								<div class="flex items-center justify-between mb-1">
									<span class="text-xs font-medium">{item.hour}</span>
									<span class="text-xs text-muted-foreground">{item.count}</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2 overflow-hidden">
									{#if stats.hourlyData.length > 0}
										{@const maxCount = Math.max(...stats.hourlyData.map(d => d.count), 1)}
										<div 
											class="bg-blue-500 h-full rounded-full transition-all"
											style="width: {maxCount > 0 ? (item.count / maxCount) * 100 : 0}%"
										></div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
	</div>
</div>

<!-- Desktop View -->
<div class="hidden md:flex flex-col gap-6 p-6 lg:p-8 max-w-7xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Analytics</h1>
			<p class="text-muted-foreground mt-1">Attendance insights and trends</p>
		</div>
		<Button variant="outline" onclick={() => goto('/settings')}>
			<ChevronLeft class="mr-2 h-4 w-4" />
			Back to Settings
		</Button>
	</div>

		<!-- Stats Grid -->
		<div class="grid grid-cols-4 gap-4">
			<Card>
				<CardContent class="p-6">
					<div class="flex items-start justify-between mb-4">
						<div class="p-3 rounded-md bg-primary/10 text-primary">
							<Users class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.totalAttendance}</div>
					<p class="text-sm text-muted-foreground mt-2">Total Attendance</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-6">
					<div class="flex items-start justify-between mb-4">
						<div class="p-3 rounded-md bg-green-500/10 text-green-500">
							<CheckCircle2 class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.attendanceRate}%</div>
					<p class="text-sm text-muted-foreground mt-2">Attendance Rate</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-6">
					<div class="flex items-start justify-between mb-4">
						<div class="p-3 rounded-md bg-blue-500/10 text-blue-500">
							<Clock class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.averageCheckInTime}</div>
					<p class="text-sm text-muted-foreground mt-2">Avg Check-In</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-6">
					<div class="flex items-start justify-between mb-4">
						<div class="p-3 rounded-md bg-purple-500/10 text-purple-500">
							<TrendingUp class="h-5 w-5" />
						</div>
					</div>
					<div class="text-3xl font-bold">{stats.activeMembers}</div>
					<p class="text-sm text-muted-foreground mt-2">Total Members</p>
				</CardContent>
			</Card>
		</div>

		<div class="grid grid-cols-2 gap-6">
			<!-- Weekly Trend -->
			<Card>
				<CardHeader>
					<CardTitle>Last 7 Days</CardTitle>
					<CardDescription>Daily attendance comparison</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="space-y-4">
						{#each stats.weekTrend as item}
							<div>
								<div class="flex items-center justify-between mb-2">
									<span class="text-sm font-medium">{item.day}</span>
									<span class="text-sm text-muted-foreground">{item.attendance} / {item.target}</span>
								</div>
								<div class="w-full bg-muted rounded-full h-3 overflow-hidden">
									<div 
										class="bg-primary h-full rounded-full transition-all"
										style="width: {item.target > 0 ? (item.attendance / item.target) * 100 : 0}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>

			<!-- Group Performance -->
			<Card>
				<CardHeader>
					<CardTitle>Group Performance</CardTitle>
					<CardDescription>Cumulative attendance by group</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="space-y-4">
						{#each stats.groupAttendance as group}
							<div class="p-4 rounded-xl border border-border/50 bg-muted/20">
								<div class="flex items-center justify-between mb-2">
									<span class="font-bold uppercase tracking-tight">{group.name}</span>
									<span class="text-sm font-bold">{Math.round((group.attendance / group.target) * 100)}%</span>
								</div>
								<div class="flex items-center gap-3">
									<div class="flex-1 bg-muted rounded-full h-2">
										<div 
											class="bg-primary h-full rounded-full"
											style="width: {group.target > 0 ? (group.attendance / group.target) * 100 : 0}%"
										></div>
									</div>
									<span class="text-xs text-muted-foreground tabular-nums">{group.attendance}/{group.target}</span>
								</div>
							</div>
						{/each}
					</div>
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
				<div class="space-y-4">
					{#each stats.hourlyData as item}
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium">{item.hour}</span>
								<span class="text-sm font-semibold text-muted-foreground">{item.count}</span>
							</div>
							<div class="w-full bg-muted rounded-full h-3 overflow-hidden">
								{#if stats.hourlyData.length > 0}
									{@const maxCount = Math.max(...stats.hourlyData.map(d => d.count), 1)}
									<div 
										class="bg-blue-500 h-full rounded-full transition-all"
										style="width: {maxCount > 0 ? (item.count / maxCount) * 100 : 0}%"
									></div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
</div>
{/if}

<style>
	:global(body) {
		overflow-x: hidden;
	}
</style>

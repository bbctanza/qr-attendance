<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { ChevronLeft, TrendingUp, Users, Clock, CheckCircle2 } from "@lucide/svelte";
	import { goto } from "$app/navigation";

	// Mock analytics data
	let analyticsData = $state({
		totalAttendance: 450,
		attendanceRate: 84,
		averageCheckInTime: "14:32",
		activeMembers: 145,
		weekTrend: [
			{ day: "Mon", attendance: 42, target: 50 },
			{ day: "Tue", attendance: 48, target: 50 },
			{ day: "Wed", attendance: 45, target: 50 },
			{ day: "Thu", attendance: 50, target: 50 },
			{ day: "Fri", attendance: 38, target: 50 },
			{ day: "Sat", attendance: 41, target: 50 },
			{ day: "Sun", attendance: 36, target: 50 }
		],
		groupAttendance: [
			{ name: "ENGINEERING", attendance: 120, target: 130 },
			{ name: "PRODUCT DESIGN", attendance: 95, target: 100 },
			{ name: "MARKETING", attendance: 78, target: 85 },
			{ name: "SALES", attendance: 102, target: 115 },
			{ name: "OPERATIONS", attendance: 55, target: 60 }
		],
		hourlyData: [
			{ hour: "9 AM", count: 15 },
			{ hour: "10 AM", count: 28 },
			{ hour: "11 AM", count: 42 },
			{ hour: "12 PM", count: 38 },
			{ hour: "1 PM", count: 45 },
			{ hour: "2 PM", count: 35 },
			{ hour: "3 PM", count: 22 }
		]
	});
</script>

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
						<Badge class="text-xs">↑ 12%</Badge>
					</div>
					<div class="text-2xl font-bold">{analyticsData.totalAttendance}</div>
					<p class="text-xs text-muted-foreground mt-1">Total Attendance</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-4">
					<div class="flex items-start justify-between mb-3">
						<div class="p-2 rounded-md bg-green-500/10 text-green-500">
							<CheckCircle2 class="h-4 w-4" />
						</div>
						<Badge class="text-xs bg-green-500/10 text-green-500 border-green-500/20">Excellent</Badge>
					</div>
					<div class="text-2xl font-bold">{analyticsData.attendanceRate}%</div>
					<p class="text-xs text-muted-foreground mt-1">Attendance Rate</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-4">
					<div class="flex items-start justify-between mb-3">
						<div class="p-2 rounded-md bg-blue-500/10 text-blue-500">
							<Clock class="h-4 w-4" />
						</div>
						<Badge class="text-xs">Average</Badge>
					</div>
					<div class="text-2xl font-bold">{analyticsData.averageCheckInTime}</div>
					<p class="text-xs text-muted-foreground mt-1">Avg Check-In</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent class="p-4">
					<div class="flex items-start justify-between mb-3">
						<div class="p-2 rounded-md bg-purple-500/10 text-purple-500">
							<TrendingUp class="h-4 w-4" />
						</div>
						<Badge class="text-xs">↑ 8%</Badge>
					</div>
					<div class="text-2xl font-bold">{analyticsData.activeMembers}</div>
					<p class="text-xs text-muted-foreground mt-1">Active Members</p>
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
					{#each analyticsData.weekTrend as item}
						<div>
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs font-medium">{item.day}</span>
								<span class="text-xs text-muted-foreground">{item.attendance}/{item.target}</span>
							</div>
							<div class="w-full bg-muted rounded-full h-2 overflow-hidden">
								<div 
									class="bg-primary h-full rounded-full transition-all"
									style="width: {(item.attendance / item.target) * 100}%"
								></div>
							</div>
						</div>
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
					{#each analyticsData.groupAttendance as group}
						<div class="flex items-center justify-between p-3 rounded-lg bg-card/50">
							<div class="min-w-0 flex-1">
								<p class="text-xs font-bold text-muted-foreground uppercase">{group.name}</p>
								<div class="flex items-center gap-2 mt-1">
									<div class="flex-1 bg-muted rounded-full h-1.5">
										<div 
											class="bg-primary h-full rounded-full"
											style="width: {(group.attendance / group.target) * 100}%"
										></div>
									</div>
									<span class="text-xs font-bold min-w-fit">{group.attendance}/{group.target}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>

		<!-- Hourly Distribution -->
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-base">Check-In Distribution</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="space-y-2">
					{#each analyticsData.hourlyData as item}
						<div class="flex items-center gap-2">
							<span class="text-xs text-muted-foreground w-12">{item.hour}</span>
							<div class="flex-1 bg-muted rounded-full h-6 flex items-center relative overflow-hidden">
								<div 
									class="bg-gradient-to-r from-primary to-primary/60 h-full rounded-full flex items-center justify-end pr-2"
									style="width: {(item.count / 50) * 100}%"
								>
									{#if item.count > 8}
										<span class="text-xs font-bold text-primary-foreground">{item.count}</span>
									{/if}
								</div>
								{#if item.count <= 8}
									<span class="text-xs font-bold text-foreground ml-2">{item.count}</span>
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
					<Badge>↑ 12%</Badge>
				</div>
				<div class="text-3xl font-bold">{analyticsData.totalAttendance}</div>
				<p class="text-sm text-muted-foreground mt-2">Total Attendance</p>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="p-6">
				<div class="flex items-start justify-between mb-4">
					<div class="p-3 rounded-md bg-green-500/10 text-green-500">
						<CheckCircle2 class="h-5 w-5" />
					</div>
					<Badge class="bg-green-500/10 text-green-500 border-green-500/20">Excellent</Badge>
				</div>
				<div class="text-3xl font-bold">{analyticsData.attendanceRate}%</div>
				<p class="text-sm text-muted-foreground mt-2">Attendance Rate</p>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="p-6">
				<div class="flex items-start justify-between mb-4">
					<div class="p-3 rounded-md bg-blue-500/10 text-blue-500">
						<Clock class="h-5 w-5" />
					</div>
					<Badge>Average</Badge>
				</div>
				<div class="text-3xl font-bold">{analyticsData.averageCheckInTime}</div>
				<p class="text-sm text-muted-foreground mt-2">Avg Check-In</p>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="p-6">
				<div class="flex items-start justify-between mb-4">
					<div class="p-3 rounded-md bg-purple-500/10 text-purple-500">
						<TrendingUp class="h-5 w-5" />
					</div>
					<Badge>↑ 8%</Badge>
				</div>
				<div class="text-3xl font-bold">{analyticsData.activeMembers}</div>
				<p class="text-sm text-muted-foreground mt-2">Active Members</p>
			</CardContent>
		</Card>
	</div>

	<!-- Charts Grid -->
	<div class="grid grid-cols-2 gap-6">
		<!-- Weekly Trend -->
		<Card>
			<CardHeader>
				<CardTitle>Weekly Attendance Trend</CardTitle>
				<CardDescription>Attendance by day of week</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="space-y-4">
					{#each analyticsData.weekTrend as item}
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium">{item.day}</span>
								<span class="text-sm text-muted-foreground">{item.attendance}/{item.target}</span>
							</div>
							<div class="w-full bg-muted rounded-full h-2.5 overflow-hidden">
								<div 
									class="bg-gradient-to-r from-primary to-primary/60 h-full rounded-full transition-all"
									style="width: {(item.attendance / item.target) * 100}%"
								></div>
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>

		<!-- Hourly Distribution -->
		<Card>
			<CardHeader>
				<CardTitle>Check-In Distribution</CardTitle>
				<CardDescription>Peak hours analysis</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="space-y-3">
					{#each analyticsData.hourlyData as item}
						<div class="flex items-center gap-3">
							<span class="text-sm text-muted-foreground w-14 min-w-fit">{item.hour}</span>
							<div class="flex-1 bg-muted rounded-full h-8 flex items-center relative overflow-hidden">
								<div 
									class="bg-gradient-to-r from-primary to-primary/60 h-full rounded-full flex items-center justify-end pr-3 transition-all"
									style="width: {(item.count / 50) * 100}%"
								>
									{#if item.count > 10}
										<span class="text-sm font-bold text-primary-foreground">{item.count}</span>
									{/if}
								</div>
								{#if item.count <= 10}
									<span class="text-sm font-bold text-foreground ml-3">{item.count}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Group Performance -->
	<Card>
		<CardHeader>
			<CardTitle>Group Performance</CardTitle>
			<CardDescription>Attendance by team</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="grid grid-cols-5 gap-4">
				{#each analyticsData.groupAttendance as group}
					<div class="p-4 rounded-lg border border-border/50">
						<p class="text-xs font-bold text-muted-foreground uppercase mb-3">{group.name}</p>
						<div class="space-y-2">
							<div class="text-2xl font-bold">{group.attendance}</div>
							<div class="w-full bg-muted rounded-full h-2">
								<div 
									class="bg-primary h-full rounded-full"
									style="width: {(group.attendance / group.target) * 100}%"
								></div>
							</div>
							<p class="text-xs text-muted-foreground">Target: {group.target}</p>
						</div>
					</div>
				{/each}
			</div>
		</CardContent>
	</Card>
</div>

<style>
	:global(body) {
		overflow-x: hidden;
	}
</style>

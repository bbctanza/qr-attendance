<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { QrCode, Users, UserCheck, UserX, Calendar, ArrowUpRight, Plus, UserPlus, CheckCircle2, XCircle } from '@lucide/svelte';
	import { automation } from '$lib/logic/automation';
	import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import * as Table from "$lib/components/ui/table";

	// Start automation on mount (client-side only logic for now)
	onMount(() => {
		automation.start();
		return () => automation.stop(); // Cleanup
	});

    // Mock Data for UI (We will connect to Supabase later)
    const liveEvent = {
        title: "Sunday Morning Service",
        location: "Main Sanctuary",
        time: "09:00 AM - 11:00 AM",
        isActive: true,
        id: "EV-2024-001"
    };

    const statsData = {
        total: 128,
        present: 86,
        absent: 42
    };

    const mobileStats = [
        { label: "TOTAL", value: 128, icon: Users, color: "text-muted-foreground", bg: "bg-muted/10" },
        { label: "PRESENT", value: 86, icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10" },
        { label: "ABSENT", value: 42, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
    ];

    const recentEvents = [
        { name: "Wednesday Bible Study", date: "Oct 24", rate: 92 },
        { name: "Youth Night", date: "Oct 22", rate: 78 },
        { name: "Sunday Service", date: "Oct 20", rate: 88 },
        { name: "Leaders Meeting", date: "Oct 18", rate: 45 },
    ];

    function getRateStyles(rate: number) {
        if (rate >= 90) return "bg-primary/10 text-primary border-primary/20";
        if (rate >= 75) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
        return "bg-destructive/10 text-destructive border-destructive/20";
    }

    function getRateColor(rate: number) {
        if (rate >= 90) return "bg-primary/10 text-primary border-primary/20";
        if (rate >= 75) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
        return "bg-destructive/10 text-destructive border-destructive/20";
    }

</script>

<!-- Mobile Content (Matching provided image) -->
<div class="flex flex-col gap-6 p-4 md:hidden bg-background min-h-screen pb-28">
    <!-- Live Event Card -->
    <div class="rounded-3xl bg-card border border-border/40 p-6 shadow-xl space-y-6">
        <div class="flex items-center justify-between uppercase tracking-wider text-[10px] font-bold">
            <div class="flex items-center gap-2 text-primary">
                <span class="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                LIVE EVENT
            </div>
            <div class="text-muted-foreground font-mono">ID: #{liveEvent.id}</div>
        </div>

        <div class="space-y-1">
            <h2 class="text-2xl font-bold tracking-tight">{liveEvent.title}</h2>
            <p class="text-xs text-muted-foreground">{liveEvent.location} • {liveEvent.time}</p>
        </div>

        <Separator class="bg-border/20" />

        <Button 
            onclick={() => goto('/scan')}
            class="w-full h-auto py-4 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold active:scale-[0.98] transition-all shadow-lg shadow-primary/10"
        >
            <QrCode class="mr-2 h-5 w-5" />
            Scan Attendees
        </Button>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-3 gap-3">
        {#each mobileStats as stat}
            <div class="flex flex-col items-center justify-center py-6 rounded-3xl bg-card border border-border/40 space-y-1">
                <div class="p-2 rounded-full {stat.bg} {stat.color}">
                    <stat.icon class="h-5 w-5" />
                </div>
                <div class="text-2xl font-bold tracking-tight">{stat.value}</div>
                <div class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{stat.label}</div>
            </div>
        {/each}
    </div>

    <!-- Recent History Section -->
    <div class="space-y-4">
        <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold tracking-tight">Recent History</h3>
            <button class="text-[10px] font-black uppercase tracking-widest text-primary">VIEW ALL</button>
        </div>

        <div class="rounded-3xl bg-card border border-border/40 overflow-hidden divide-y divide-border/20">
            <div class="grid grid-cols-[1.5fr_1fr_0.5fr] px-6 py-3 uppercase tracking-widest text-[10px] font-black text-muted-foreground/40">
                <div>EVENT NAME</div>
                <div class="text-center text-nowrap">DATE</div>
                <div class="text-right">RATE</div>
            </div>
            {#each recentEvents as event}
                <div class="grid grid-cols-[1.5fr_1fr_0.5fr] items-center px-6 py-4">
                    <div class="text-sm font-bold pr-2 leading-tight">{event.name}</div>
                    <div class="text-xs text-muted-foreground text-center truncate">{event.date}</div>
                    <div class="flex justify-end">
                        <span class="px-2 py-1 rounded-lg border text-[10px] font-bold {getRateStyles(event.rate)}">
                            {event.rate}%
                        </span>
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-2 gap-4">
        <button class="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border/40 text-left active:scale-[0.98] transition-all">
            <div class="p-3 rounded-2xl bg-primary/10 text-primary">
                <Plus class="h-6 w-6" />
            </div>
            <div>
                <div class="text-sm font-bold">New Event</div>
                <div class="text-[10px] text-muted-foreground">Create session</div>
            </div>
        </button>

        <button class="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border/40 text-left active:scale-[0.98] transition-all">
            <div class="p-3 rounded-2xl" style="background: color-mix(in oklch, var(--stat-secondary) 10%, transparent); color: var(--stat-secondary)">
                <UserPlus class="h-6 w-6" />
            </div>
            <div>
                <div class="text-sm font-bold">Add Member</div>
                <div class="text-[10px] text-muted-foreground">Register user</div>
            </div>
        </button>
    </div>
</div>

<!-- Desktop Content (Shadcn UI) -->
<div class="hidden md:flex flex-1 flex-col gap-4 p-4 pt-0">
    <div class="flex items-center justify-end space-y-2">
        <div class="flex items-center space-x-2">
            <Button size="sm" class="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus class="mr-2 h-4 w-4" /> New Event
            </Button>
        </div>
    </div>
    
	<Card class="relative overflow-hidden border-border bg-linear-to-br from-card to-card/50 shadow-lg">
         <div class="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"></div>

		<CardHeader class="pb-2">
            <div class="flex items-center justify-between">
                <Badge variant="outline" class="border-primary/50 text-primary animate-pulse bg-primary/10">
                    <span class="mr-1.5 flex h-2 w-2 rounded-full bg-primary"></span>
                    LIVE EVENT
                </Badge>
                <span class="text-xs font-mono text-muted-foreground">ID: #{liveEvent.id}</span>
            </div>
			<CardTitle class="mt-2 text-2xl md:text-3xl">{liveEvent.title}</CardTitle>
            <CardDescription class="flex items-center text-sm md:text-base mt-1">
               {liveEvent.location} • {liveEvent.time}
            </CardDescription>
		</CardHeader>
		<CardContent>
            <div class="mt-4">
                <Button size="lg" class="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 font-bold" onclick={() => goto('/scan')}>
                    <QrCode class="mr-2 h-5 w-5" />
                    Scan Attendees
                </Button>
            </div>
		</CardContent>
	</Card>

	<div class="grid gap-4 md:grid-cols-3">
		<Card>
			<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle class="text-sm font-medium">Total Expected</CardTitle>
				<Users class="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				<div class="text-3xl font-bold">{statsData.total}</div>
				<p class="text-xs text-muted-foreground">Registered members</p>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle class="text-sm font-medium">Present</CardTitle>
			<UserCheck class="h-4 w-4" style="color: var(--stat-success)" />
		</CardHeader>
		<CardContent>
			<div class="text-3xl font-bold" style="color: var(--stat-success)">{statsData.present}</div>
				<div class="mt-1 h-1 w-full rounded-full bg-secondary">
                    <div class="h-1 rounded-full" style="background-color: var(--stat-success); width: {(statsData.present / statsData.total) * 100}%"></div>
                </div>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle class="text-sm font-medium">Absent</CardTitle>
				<UserX class="h-4 w-4 text-red-500" />
			</CardHeader>
			<CardContent>
				<div class="text-3xl font-bold text-red-500">{statsData.absent}</div>
                <div class="mt-1 h-1 w-full rounded-full bg-secondary">
                    <div class="h-1 rounded-full bg-red-500" style="width: {(statsData.absent / statsData.total) * 100}%"></div>
                </div>
			</CardContent>
		</Card>
	</div>

    <div class="grid gap-4 md:grid-cols-7 lg:grid-cols-8">
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
                            <Table.Head class="min-w-37.5">Event Name</Table.Head>
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
                                    <Badge variant="outline" class="{getRateColor(event.rate)}">
                                        {event.rate}%
                                    </Badge>
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </CardContent>
        </Card>

        <div class="col-span-1 md:col-span-3 lg:col-span-3 grid gap-4">
            <Card class="flex flex-col justify-center bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer border-dashed">
                <CardHeader class="items-center pb-2">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary mb-2">
                        <Plus class="h-6 w-6" />
                    </div>
                    <CardTitle class="text-lg">New Event</CardTitle>
                </CardHeader>
               <CardFooter class="justify-center pb-6 text-sm text-muted-foreground">
                    Create a custom session
               </CardFooter>
            </Card>

            <Card class="flex flex-col justify-center bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer border-dashed">
                <CardHeader class="items-center pb-2">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full mb-2" style="background: color-mix(in oklch, var(--stat-secondary) 20%, transparent); color: var(--stat-secondary)">
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


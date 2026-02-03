<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { QrCode, Users, UserCheck, UserX, Calendar, ArrowUpRight, Plus, UserPlus, CheckCircle2, XCircle } from '@lucide/svelte';
	import { automation } from '$lib/logic/automation';
	import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import * as Table from "$lib/components/ui/table";
    import { supabase } from '$lib/supabase';

    // State
    let isLoading = $state(true);
    let liveEvent = $state<any>(null);

    let statsData = $state({
        total: 0,
        present: 0,
        absent: 0
    });

    let mobileStats = $derived([
        { label: "TOTAL", value: statsData.total, icon: Users, color: "text-muted-foreground", bg: "bg-muted/10" },
        { label: "PRESENT", value: statsData.present, icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10" },
        { label: "ABSENT", value: statsData.absent, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
    ]);

    let recentEvents = $state<any[]>([]);

	// Start automation on mount (client-side only logic for now)
	onMount(() => {
		automation.start();
        fetchDashboardData();
		return () => automation.stop(); // Cleanup
	});

    async function fetchDashboardData() {
        try {
            // 1. Total Members
            const { count: totalCount, error: memberError } = await supabase
                .from('members')
                .select('*', { count: 'exact', head: true });
            
            const total = totalCount || 0;

            // 2. Latest Event (Active or Past)
            let currentEventData = null;
            
            const { data: activeEvents } = await supabase
                .from('events')
                .select('*')
                .in('status', ['ongoing', 'upcoming'])
                .order('start_datetime', { ascending: true })
                .limit(1);
            
            if (activeEvents && activeEvents.length > 0) {
                currentEventData = activeEvents[0];
            } else {
                const { data: pastEvents } = await supabase
                    .from('events')
                    .select('*')
                    .eq('status', 'completed')
                    .order('end_datetime', { ascending: false })
                    .limit(1);
                if (pastEvents && pastEvents.length > 0) {
                    currentEventData = pastEvents[0];
                }
            }

            // 3. Process Live/Current Event
            let present = 0;
            if (currentEventData) {
                const { count: scanCount } = await supabase
                    .from('attendance_scans')
                    .select('*', { count: 'exact', head: true })
                    .eq('event_id', currentEventData.event_id);
                
                present = scanCount || 0;

                const start = new Date(currentEventData.start_datetime);
                const end = new Date(currentEventData.end_datetime);
                const timeStr = `${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

                liveEvent = {
                    id: currentEventData.event_id.toString(),
                    title: currentEventData.event_name,
                    location: (currentEventData.metadata as any)?.location || 'Main Sanctuary',
                    time: timeStr,
                    isActive: currentEventData.status === 'ongoing' || currentEventData.status === 'upcoming',
                    status: currentEventData.status
                };
            }

            statsData = {
                total,
                present,
                absent: total - present
            };

            // 4. Recent Events
            const { data: historyEvents } = await supabase
                .from('events')
                .select('*')
                .eq('status', 'completed')
                .neq('event_id', currentEventData?.event_id || -1)
                .order('end_datetime', { ascending: false })
                .limit(4);

            if (historyEvents) {
                recentEvents = await Promise.all(historyEvents.map(async (ev) => {
                    const { count: evCount } = await supabase
                        .from('attendance_scans')
                        .select('*', { count: 'exact', head: true })
                        .eq('event_id', ev.event_id);
                    
                    const p = evCount || 0;
                    const rate = total > 0 ? Math.round((p / total) * 100) : 0;
                    
                    const d = new Date(ev.event_date);
                    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                    return {
                        name: ev.event_name,
                        date: dateStr,
                        rate
                    };
                }));
            }

        } catch (err) {
            console.error("Data load failed:", err);
        } finally {
            isLoading = false;
        }
    }

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
        {#if isLoading}
            <div class="space-y-4 animate-pulse">
                <div class="h-4 w-24 bg-muted rounded"></div>
                <div class="h-8 w-3/4 bg-muted rounded"></div>
                <div class="h-4 w-1/2 bg-muted rounded"></div>
                <div class="h-12 w-full bg-muted rounded-2xl"></div>
            </div>
        {:else if liveEvent}
            <div class="flex items-center justify-between uppercase tracking-wider text-[10px] font-bold">
                <div class="flex items-center gap-2 text-primary">
                    <span class="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                    {liveEvent.isActive ? 'LIVE EVENT' : 'LATEST EVENT'}
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
        {:else}
             <div class="flex flex-col items-center justify-center space-y-4 text-center py-6">
                <div class="p-3 bg-muted/20 rounded-full">
                    <Calendar class="h-8 w-8 text-muted-foreground" />
                </div>
                <div class="space-y-1">
                    <h2 class="text-xl font-bold">No Active Event</h2>
                    <p class="text-xs text-muted-foreground">There are no events scheduled right now.</p>
                </div>
                <Button variant="outline" onclick={() => goto('/events')} class="rounded-xl">
                    Check Schedule
                </Button>
            </div>
        {/if}
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
            <button class="text-[10px] font-black uppercase tracking-widest text-primary" onclick={() => goto('/history')}>VIEW ALL</button>
        </div>

        <div class="rounded-3xl bg-card border border-border/40 overflow-hidden divide-y divide-border/20">
             {#if isLoading}
                  <div class="p-8 text-center text-muted-foreground">Loading history...</div>
             {:else if recentEvents.length === 0}
                  <div class="p-8 text-center text-muted-foreground">No recent history</div>
             {:else}
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
             {/if}
        </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-2 gap-4">
        <button 
            onclick={() => goto('/events')}
            class="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border/40 text-left active:scale-[0.98] transition-all"
        >
            <div class="p-3 rounded-2xl bg-primary/10 text-primary">
                <Plus class="h-6 w-6" />
            </div>
            <div>
                <div class="text-sm font-bold">New Event</div>
                <div class="text-[10px] text-muted-foreground">Create session</div>
            </div>
        </button>

        <button 
            onclick={() => goto('/members')}
            class="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border/40 text-left active:scale-[0.98] transition-all"
        >
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
<div class="hidden md:flex flex-1 flex-col gap-4 p-4 pt-6">
	<Card class="relative overflow-hidden border-border bg-linear-to-br from-card to-card/50 shadow-lg">
         <div class="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"></div>

        {#if isLoading}
            <CardHeader class="pb-2">
                <div class="animate-pulse space-y-3">
                    <div class="h-6 w-24 bg-muted rounded"></div>
                    <div class="h-10 w-1/2 bg-muted rounded"></div>
                </div>
            </CardHeader>
        {:else if liveEvent}
            <CardHeader class="pb-2">
                <div class="flex items-center justify-between">
                    {#if liveEvent.isActive}
                        <Badge variant="outline" class="border-primary/50 text-primary animate-pulse bg-primary/10">
                            <span class="mr-1.5 flex h-2 w-2 rounded-full bg-primary"></span>
                            LIVE EVENT
                        </Badge>
                    {:else}
                        <Badge variant="outline" class="border-muted text-muted-foreground bg-muted/10">
                            COMPLETED
                        </Badge>
                    {/if}
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
        {:else}
            <CardHeader class="pb-2">
			    <CardTitle class="mt-2 text-2xl md:text-3xl">No Active Event</CardTitle>
                <CardDescription class="flex items-center text-sm md:text-base mt-1">
                   Check back later for upcoming sessions.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div class="mt-4 flex gap-3">
                    <Button size="lg" class="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 font-bold" onclick={() => goto('/events')}>
                        <Plus class="mr-2 h-5 w-5" />
                        New Event
                    </Button>
                    <Button size="lg" variant="outline" onclick={() => goto('/events')}>
                        <Calendar class="mr-2 h-5 w-5" />
                        View Schedule
                    </Button>
                </div>
            </CardContent>
        {/if}
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
                <Button variant="ghost" size="sm" class="ml-auto gap-1 text-primary" onclick={() => goto('/history')}>
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
                        {#if isLoading}
                             <Table.Row>
                                <Table.Cell colspan={3} class="text-center text-muted-foreground h-24">Loading history...</Table.Cell>
                            </Table.Row>
                        {:else if recentEvents.length === 0}
                            <Table.Row>
                                <Table.Cell colspan={3} class="text-center text-muted-foreground h-24">No recent sessions found.</Table.Cell>
                            </Table.Row>
                        {:else}
                            {#each recentEvents as event}
                                <Table.Row>
                                    <Table.Cell>
                                        <div class="font-medium">{event.name}</div>
                                    </Table.Cell>
                                    <Table.Cell class="text-right text-muted-foreground">{event.date}</Table.Cell>
                                    <Table.Cell class="text-right">
                                        <Badge variant="outline" class={getRateStyles(event.rate)}>
                                            {event.rate}%
                                        </Badge>
                                    </Table.Cell>
                                </Table.Row>
                            {/each}
                        {/if}
                    </Table.Body>
                </Table.Root>
            </CardContent>
        </Card>

        <div class="col-span-1 md:col-span-3 lg:col-span-3 grid gap-4">
            <button 
                onclick={() => goto('/events')}
                class="text-left"
            >
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
            </button>

            <button 
                onclick={() => goto('/members')}
                class="text-left"
            >
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
            </button>
        </div>
    </div>
</div>


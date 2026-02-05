<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import * as Table from "$lib/components/ui/table";
    import { Badge } from "$lib/components/ui/badge";
    import { Input } from "$lib/components/ui/input";
    import { Search, Calendar, Filter, ChevronRight, Users, CheckCircle2 } from "@lucide/svelte";
    import { ChevronLeft, HelpCircle, MapPin, QrCode, Clock, FileText, ArrowRight, ScanLine, TrendingUp, X } from "@lucide/svelte";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "$lib/components/ui/card";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import { ArcChart, Text } from "layerchart";
    import { formatTimeRange, formatLocalTime } from '$lib/utils/time';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuCheckboxItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
    } from "$lib/components/ui/dropdown-menu";
    import {
        Popover,
        PopoverContent,
        PopoverTrigger,
    } from "$lib/components/ui/popover";
    import {
        Drawer,
        DrawerContent,
        DrawerHeader,
        DrawerTitle,
        DrawerTrigger,
        DrawerClose,
    } from "$lib/components/ui/drawer";
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { goto } from "$app/navigation";
    import FullPageLoading from "$lib/components/full-page-loading.svelte";

    // State
    let events = $state<any[]>([]);
    let currentEvent = $state<any>(null);
    let recentScans = $state<any[]>([]);
    let isLoading = $state(true);
    let stats = $state({ present: 0, expected: 0 });
    let drawerOpen = $state(false);
    let query = $state("");

    onMount(async () => {
        isLoading = true;
        try {
            await Promise.all([
                fetchOngoingEvent(),
                fetchRecentEvents(),
                fetchRecentScans()
            ]);
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
            events = await Promise.all(data.map(async (e) => {
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
            }));
        }
    }

    async function fetchRecentScans() {
        const { data } = await supabase
            .from('attendance_scans')
            .select('*, members(*)')
            .order('scan_datetime', { ascending: false })
            .limit(5);
        
        if (data) {
            recentScans = await Promise.all(data.map(async (s) => ({
                id: s.scan_id,
                name: s.members ? `${s.members.first_name} ${s.members.last_name}` : 'Unknown Member',
                role: s.members?.metadata?.role || 'Member',
                time: await formatLocalTime(s.scan_datetime),
                avatar: s.members ? `https://api.dicebear.com/7.x/initials/svg?seed=${s.members.first_name}%20${s.members.last_name}` : 'https://api.dicebear.com/7.x/initials/svg?seed=U'
            })));
        }
    }

    let filteredEvents = $derived(events.filter(e => e.name.toLowerCase().includes(query.toLowerCase())));

    // Chart calculations
    let participationRate = $derived(stats.expected > 0 ? Math.round((stats.present / stats.expected) * 100) : 0);
    let sessionProgressData = $derived([{ label: "participation", value: participationRate }]);
    const chartConfig = {
        participation: { label: "Participation", color: "var(--color-primary)" },
    } satisfies Chart.ChartConfig;
</script>

{#if isLoading}
    <FullPageLoading message="Synchronizing attendance data..." />
{:else}
    <!-- Mobile View -->
    <div class="flex flex-col gap-4 p-4 md:hidden pb-28">
        
        <!-- Live Session Card -->
        {#if currentEvent}
            <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm space-y-4">
                <div class="flex items-start justify-between">
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="h-2 w-2 rounded-full bg-(--color-primary) inline-block animate-pulse"></span>
                            <div class="text-xs uppercase tracking-widest text-(--color-primary) font-black">Live Session</div>
                        </div>
                        <div class="text-xl font-extrabold tracking-tight">{currentEvent.name}</div>
                        <div class="text-[12px] text-muted-foreground flex items-center gap-2 mt-2">
                            <MapPin class="h-4 w-4" />
                            <span>{currentEvent.place}</span>
                        </div>
                    </div>
                    <div class="text-right text-xs text-muted-foreground">
                        <div class="uppercase tracking-widest">Time</div>
                        <div class="font-bold">{currentEvent.time}</div>
                    </div>
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-border/20">
                    <div></div>
                    <Drawer bind:open={drawerOpen}>
                        <DrawerTrigger>
                            <Button variant="outline" size="sm" class="uppercase">Details &nbsp; <ChevronRight class="h-3 w-3" /></Button>
                        </DrawerTrigger>
                        <DrawerContent>
                            <DrawerHeader class="flex flex-row items-center justify-between">
                                <DrawerTitle>Event Details</DrawerTitle>
                                <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={() => drawerOpen = false}>
                                    <X class="h-4 w-4" />
                                </Button>
                            </DrawerHeader>
                            <div class="px-4 pb-4 space-y-4">
                                <div>
                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <FileText class="h-4 w-4" />
                                        Event Name
                                    </h4>
                                    <p class="text-lg font-bold mt-1">{currentEvent.name}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <Calendar class="h-4 w-4" />
                                        Date
                                    </h4>
                                    <p class="text-base mt-1">{currentEvent.date || currentEvent.day}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <Clock class="h-4 w-4" />
                                        Time
                                    </h4>
                                    <p class="text-base mt-1">{currentEvent.time}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <MapPin class="h-4 w-4" />
                                        Place
                                    </h4>
                                    <p class="text-base mt-1">{currentEvent.place}</p>
                                </div>
                            </div>
                        </DrawerContent>
                    </Drawer>
                </div>
            </div>

            <!-- Session Progress -->
            <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="text-sm font-medium flex items-center gap-2">
                            <TrendingUp class="h-4 w-4" />
                            Session Progress
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">Live Updates</div>
                    </div>
                </div>
                <div class="flex items-center gap-4 mt-4">
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
                                    color: "var(--color-primary)",
                                    data: [d],
                                }))}
                                props={{
                                    arc: { track: { fill: "var(--muted)" }, motion: "tween" },
                                    tooltip: { context: { hideDelay: 350 } },
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
                        <div class="text-xs uppercase text-muted-foreground tracking-widest">Participation</div>
                        <div class="text-lg font-bold text-(--color-primary) mt-2">{participationRate}%</div>
                        <div class="text-xs text-muted-foreground mt-3">{stats.present} / {stats.expected} Checked In</div>
                    </div>
                </div>
            </div>

            <!-- Small stats -->
            <div class="grid grid-cols-2 gap-3">
                <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
                    <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                        <CheckCircle2 class="h-4 w-4 text-(--stat-success)" />
                        <div class="uppercase tracking-widest">Checked In</div>
                    </div>
                    <div class="text-2xl font-extrabold mt-2">{stats.present}</div>
                </div>
                <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
                    <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                        <Users class="h-4 w-4 text-(--color-primary)" />
                        <div class="uppercase tracking-widest">Expected</div>
                    </div>
                    <div class="text-2xl font-extrabold mt-2">{stats.expected}</div>
                </div>
            </div>
        {:else}
            <Card class="bg-muted/30 border-dashed border-2">
                <CardContent class="p-8 flex flex-col items-center justify-center text-center space-y-3">
                    <Calendar class="h-10 w-10 text-muted-foreground opacity-20" />
                    <div class="font-bold">No Live Session</div>
                    <p class="text-xs text-muted-foreground">There are no ongoing events at the moment. Active events will appear here.</p>
                </CardContent>
            </Card>
        {/if}

        <!-- Recent Scans -->
        <div class="flex items-center justify-between mt-4">
            <h3 class="text-lg font-bold flex items-center gap-2">
                <ScanLine class="h-5 w-5" />
                Recent Scans
            </h3>
            <a href="/attendance/history" class="text-xs text-(--color-primary) font-bold flex items-center gap-1">
                VIEW ALL
                <ArrowRight class="h-3 w-3" />
            </a>
        </div>

        <div class="space-y-3">
            {#if recentScans.length > 0}
                {#each recentScans as scan}
                    <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm flex items-center justify-between">
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
                        <div class="text-xs text-muted-foreground flex items-center gap-2">
                            <div>{scan.time}</div>
                            <span class="h-2 w-2 rounded-full bg-(--stat-success)"></span>
                        </div>
                    </div>
                {/each}
            {:else}
                <div class="p-8 text-center text-muted-foreground text-sm italic">No recent scans found.</div>
            {/if}
        </div>
    </div>

    <!-- Desktop View -->
    <div class="hidden md:grid grid-cols-3 gap-6 p-6 lg:p-8">
        <!-- Left / Main (span 2) -->
        <div class="col-span-2 space-y-6">
            {#if currentEvent}
                <Card>
                    <CardContent class="p-6">
                        <div class="flex items-start justify-between">
                            <div class="space-y-1">
                                <div class="text-[10px] uppercase tracking-widest text-(--color-primary) font-black flex items-center gap-2">
                                    <span class="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                                    LIVE SESSION
                                </div>
                                <h3 class="text-2xl font-extrabold tracking-tight">{currentEvent.name}</h3>
                                <div class="text-sm text-muted-foreground mt-1 flex items-center gap-2"><MapPin class="h-4 w-4" /> {currentEvent.place}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-sm font-bold">{currentEvent.time}</div>
                                <div class="text-xs text-muted-foreground mt-1 uppercase tracking-widest">Time</div>
                                <div class="mt-4">
                                    <Popover>
                                        <PopoverTrigger>
                                            <Button variant="outline" size="sm">Details &nbsp; <ChevronRight class="h-3 w-3" /></Button>
                                        </PopoverTrigger>
                                        <PopoverContent class="w-80">
                                            <div class="space-y-3">
                                                <div>
                                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                        <FileText class="h-4 w-4" />
                                                        Event Name
                                                    </h4>
                                                    <p class="text-lg font-bold">{currentEvent.name}</p>
                                                </div>
                                                <div>
                                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                        <Calendar class="h-4 w-4" />
                                                        Date
                                                    </h4>
                                                    <p class="text-base">{currentEvent.date || currentEvent.day}</p>
                                                </div>
                                                <div>
                                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                        <Clock class="h-4 w-4" />
                                                        Time
                                                    </h4>
                                                    <p class="text-base">{currentEvent.time}</p>
                                                </div>
                                                <div>
                                                    <h4 class="font-semibold text-sm text-muted-foreground uppercase tracking-widest flex items-center gap-2">
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
                    <CardContent class="p-6 flex gap-6 items-center">
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
                                        color: "var(--color-primary)",
                                        data: [d],
                                    }))}
                                    props={{
                                        arc: { track: { fill: "var(--muted)" }, motion: "tween" },
                                        tooltip: { context: { hideDelay: 350 } },
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
                                    <div class="text-sm font-medium flex items-center gap-2">
                                        <TrendingUp class="h-4 w-4" />
                                        Session Progress
                                    </div>
                                    <div class="text-xs text-muted-foreground mt-1">Live Updates</div>
                                </div>
                                <div class="text-sm text-muted-foreground">
                                    <div class="text-xs font-bold">{stats.present} / {stats.expected}</div>
                                    <div class="text-[10px] uppercase tracking-tighter text-right">Attending</div>
                                </div>
                            </div>

                            <div class="mt-6">
                                <div class="text-xs uppercase text-muted-foreground tracking-widest">Overall Participation</div>
                                <div class="text-3xl font-bold text-(--color-primary) mt-1">{participationRate}%</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div class="grid grid-cols-2 gap-4">
                    <Card class="p-0">
                        <CardContent class="p-4">
                            <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                <CheckCircle2 class="h-4 w-4 text-(--stat-success)" />
                                <div class="uppercase tracking-widest">Checked In</div>
                            </div>
                            <div class="text-2xl font-extrabold mt-2">{stats.present}</div>
                        </CardContent>
                    </Card>

                    <Card class="p-0">
                        <CardContent class="p-4">
                            <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                <Users class="h-4 w-4 text-(--color-primary)" />
                                <div class="uppercase tracking-widest">Expected</div>
                            </div>
                            <div class="text-2xl font-extrabold mt-2">{stats.expected}</div>
                        </CardContent>
                    </Card>
                </div>
            {:else}
                <Card class="bg-muted/30 border-dashed border-2 p-12 w-full">
                    <CardContent class="flex flex-col items-center justify-center text-center space-y-4">
                        <div class="p-4 rounded-full bg-muted">
                            <Calendar class="h-12 w-12 text-muted-foreground opacity-30" />
                        </div>
                        <div>
                            <h3 class="text-xl font-bold">No Ongoing Events</h3>
                            <p class="text-muted-foreground max-w-md mx-auto mt-2">There are no live sessions currently active. Start or schedule an event from the Events Management page to see live attendance tracking.</p>
                        </div>
                        <Button variant="outline" onclick={() => goto('/events')}>Go to Events</Button>
                    </CardContent>
                </Card>
            {/if}

            <div class="flex items-center justify-between pb-2 border-b mt-8">
                <h3 class="text-xl font-bold tracking-tight">Recent Sessions</h3>
                <a href="/attendance/history" class="text-sm text-primary font-bold hover:underline">View History</a>
            </div>

            <div class="grid grid-cols-2 gap-4 mt-4">
                {#each events.slice(0, 4) as e}
                    <Card class="hover:border-primary/50 transition-colors cursor-pointer" onclick={() => goto(`/attendance/history?event=${e.id}`)}>
                        <CardContent class="p-4">
                            <div class="flex items-start justify-between">
                                <div class="min-w-0">
                                    <div class="text-xs text-muted-foreground font-medium uppercase mb-1">{new Date(e.date).toLocaleDateString()}</div>
                                    <h4 class="font-bold truncate">{e.name}</h4>
                                </div>
                                <Badge variant="secondary" class="font-bold">{e.attendees}</Badge>
                            </div>
                        </CardContent>
                    </Card>
                {/each}
            </div>
        </div>

        <!-- Right / Sidebar -->
        <aside class="col-span-1 flex flex-col h-full gap-6">
            <Card class="flex-1 flex flex-col h-full">
                <CardHeader class="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle class="flex items-center gap-2">
                            <ScanLine class="h-5 w-5" />
                            Recent Scans
                        </CardTitle>
                        <CardDescription>Latest check-ins</CardDescription>
                    </div>
                </CardHeader>
                <CardContent class="space-y-3 overflow-auto flex-1 p-4">
                    {#if recentScans.length > 0}
                        {#each recentScans as scan}
                            <div class="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                <Avatar class="h-10 w-10 border border-border/50">
                                    <AvatarImage src={scan.avatar} alt={scan.name} />
                                    <AvatarFallback>{scan.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm truncate uppercase tracking-tight">{scan.name}</div>
                                    <div class="text-[10px] text-muted-foreground uppercase">{scan.role}</div>
                                </div>
                                <div class="text-[10px] font-bold text-muted-foreground">{scan.time}</div>
                            </div>
                        {/each}
                    {:else}
                        <div class="flex flex-col items-center justify-center p-12 opacity-20 italic text-sm h-full">
                            <ScanLine class="h-12 w-12 mb-2" />
                            No scans yet
                        </div>
                    {/if}
                </CardContent>
                <CardFooter class="p-4 border-t">
                    <Button class="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" onclick={() => goto('/scan')}>
                        <QrCode class="h-4 w-4 mr-2" />
                        Open Scanner
                    </Button>
                </CardFooter>
            </Card>
        </aside>
    </div>
{/if}

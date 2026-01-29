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

    // Mock Data
    const events = [
        { id: 1, name: "Sunday Morning Service", date: "2023-10-22", attendees: 124, status: "Completed" },
        { id: 2, name: "Wednesday Bible Study", date: "2023-10-18", attendees: 45, status: "Completed" },
        { id: 3, name: "Youth Night", date: "2023-10-17", attendees: 32, status: "Completed" },
        { id: 4, name: "Leadership Meeting", date: "2023-10-15", attendees: 12, status: "Completed" },
        { id: 5, name: "Sunday Morning Service", date: "2023-10-15", attendees: 118, status: "Completed" },
        { id: 6, name: "Special Worship Night", date: "2023-10-14", attendees: 200, status: "Completed" },
    ];

    // Current live event
    const currentEvent = {
        name: "Q3 Quarterly Review",
        date: "2024-01-29", // Assuming today's date for demo
        day: "Monday", // Or null if not recurring
        time: "14:00 - 16:00",
        place: "Main Conference Hall"
    };

    let drawerOpen = $state(false);

    let query = $state("");

    let filteredEvents = $derived(events.filter(e => e.name.toLowerCase().includes(query.toLowerCase())));

    // Chart data for session progress
    const sessionProgressData = [{ label: "participation", value: 84 }];
    const chartConfig = {
        participation: { label: "Participation", color: "var(--color-primary)" },
    } satisfies Chart.ChartConfig;
</script>

<!-- Mobile View -->
<div class="flex flex-col gap-4 p-4 md:hidden pb-28">
    

    <!-- Live Session Card -->
    <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm space-y-4">
        <div class="flex items-start justify-between">
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="h-2 w-2 rounded-full bg-(--color-primary) inline-block"></span>
                    <div class="text-xs uppercase tracking-widest text-(--color-primary) font-black">Live Session</div>
                </div>
                <div class="text-xl font-extrabold tracking-tight">Q3 Quarterly Review</div>
                <div class="text-[12px] text-muted-foreground flex items-center gap-2 mt-2">
                    <MapPin class="h-4 w-4" />
                    <span>Main Conference Hall</span>
                </div>
            </div>
            <div class="text-right text-xs text-muted-foreground">
                <div class="uppercase tracking-widest">Time</div>
                <div class="font-bold">14:00 - 16:00</div>
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
                            <p class="text-base mt-1">{currentEvent.day ? currentEvent.day : currentEvent.date}</p>
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
                <div class="text-xs text-muted-foreground mt-1">On Track</div>
            </div>
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <div class="text-xs">Elapsed</div>
                <div class="font-bold">0h 15m</div>
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
                                value="84%"
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
                <div class="text-lg font-bold text-(--color-primary) mt-2">84%</div>
                <div class="text-xs text-muted-foreground mt-3">45 mins left</div>
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
            <div class="text-2xl font-extrabold mt-2">42</div>
        </div>
        <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
            <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Users class="h-4 w-4 text-(--color-primary)" />
                <div class="uppercase tracking-widest">Expected</div>
            </div>
            <div class="text-2xl font-extrabold mt-2">50</div>
        </div>
    </div>



    <!-- Recent Scans -->
    <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold flex items-center gap-2">
            <ScanLine class="h-5 w-5" />
            Recent Scans
        </h3>
        <a href="/attendance" class="text-xs text-(--color-primary) font-bold flex items-center gap-1">
            VIEW ALL
            <ArrowRight class="h-3 w-3" />
        </a>
    </div>

    <div class="space-y-3">
        {#each [
            { id: 1, name: 'Sarah Jenkins', role: 'Product Designer', time: '14:05', avatar: 'https://i.pravatar.cc/40?img=12' },
            { id: 2, name: 'Mike Ross', role: 'Engineering Lead', time: '14:02', avatar: 'https://i.pravatar.cc/40?img=14' },
            { id: 3, name: 'David Chen', role: 'Marketing Specialist', time: '13:58', avatar: 'https://i.pravatar.cc/40?img=6' }
        ] as scan}
            <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <Avatar class="h-10 w-10 rounded-full">
                        <AvatarImage src={scan.avatar} alt={scan.name} />
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
    </div>

    <!-- Floating scan button -->

</div>

<!-- Desktop View (Web-first layout) -->
<div class="hidden md:grid grid-cols-3 gap-6 p-6 lg:p-8">
    <!-- Left / Main (span 2) -->
    <div class="col-span-2 space-y-6">
        <!-- Live Session Card -->
        <Card>
            <CardContent class="p-6">
                <div class="flex items-start justify-between">
                    <div class="space-y-1">
                        <div class="text-[10px] uppercase tracking-widest text-(--color-primary) font-black">LIVE SESSION</div>
                        <h3 class="text-2xl font-extrabold tracking-tight">Q3 Quarterly Review</h3>
                        <div class="text-sm text-muted-foreground mt-1 flex items-center gap-2"><MapPin class="h-4 w-4" /> Main Conference Hall</div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-bold">14:00 - 16:00</div>
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
                                            <p class="text-base">{currentEvent.day ? currentEvent.day : currentEvent.date}</p>
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

        <!-- Session Progress Card -->
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
                                    value="84%"
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
                            <div class="text-xs text-muted-foreground mt-1">On Track</div>
                        </div>
                        <div class="text-sm text-muted-foreground">
                            <div class="text-xs">Elapsed</div>
                            <div class="font-bold">0h 15m</div>
                        </div>
                    </div>

                    <div class="mt-6">
                        <div class="text-xs uppercase text-muted-foreground tracking-widest">Participation</div>
                        <div class="text-3xl font-bold text-(--color-primary) mt-1">84%</div>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Stats Row -->
        <div class="grid grid-cols-2 gap-4">
            <Card class="p-0">
                <CardContent class="p-4">
                                <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                        <CheckCircle2 class="h-4 w-4 text-(--stat-success)" />
                        <div class="uppercase tracking-widest">Checked In</div>
                    </div>
                    <div class="text-2xl font-extrabold mt-2">42</div>
                </CardContent>
            </Card>

            <Card class="p-0">
                <CardContent class="p-4">
                    <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                        <Users class="h-4 w-4 text-(--color-primary)" />
                        <div class="uppercase tracking-widest">Expected</div>
                    </div>
                    <div class="text-2xl font-extrabold mt-2">50</div>
                </CardContent>
            </Card>
        </div>
    </div>

    <!-- Right / Sidebar -->
    <aside class="col-span-1 flex flex-col h-full gap-6">
        <Card class="flex-1 flex flex-col h-full">
            <CardHeader class="flex items-center justify-between">
                <div>
                    <CardTitle class="flex items-center gap-2">
                        <ScanLine class="h-5 w-5" />
                        Recent Scans
                    </CardTitle>
                    <CardDescription>Latest check-ins</CardDescription>
                </div>
                <a href="/attendance" class="text-xs text-(--color-primary) font-bold flex items-center gap-1">
                    View all
                    <ArrowRight class="h-3 w-3" />
                </a>
            </CardHeader>
            <CardContent class="space-y-3 overflow-auto flex-1">
                {#each [
                    { id: 1, name: 'Sarah Jenkins', role: 'Product Designer', time: '14:05', avatar: 'https://i.pravatar.cc/40?img=12' },
                    { id: 2, name: 'Mike Ross', role: 'Engineering Lead', time: '14:02', avatar: 'https://i.pravatar.cc/40?img=14' },
                    { id: 3, name: 'David Chen', role: 'Marketing Specialist', time: '13:58', avatar: 'https://i.pravatar.cc/40?img=6' }
                ] as scan}
                    <div class="flex items-center gap-3 p-3 rounded-lg bg-card/30">
                        <Avatar class="h-12 w-12 rounded-full">
                            <AvatarImage src={scan.avatar} alt={scan.name} />
                        </Avatar>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold truncate">{scan.name}</div>
                            <div class="text-xs text-muted-foreground">{scan.role}</div>
                        </div>
                        <div class="text-xs text-muted-foreground">{scan.time}</div>
                    </div>
                {/each}
            </CardContent>
            <CardFooter class="pt-0">
                <Button class="w-full h-14 rounded-xl bg-(--color-primary) text-(--color-primary-foreground) font-bold" onclick={() => {/* open scanner */}}>
                    <QrCode class="h-5 w-5 mr-2" />
                    Open Scanner
                </Button>
            </CardFooter>
        </Card>
    </aside>
</div>

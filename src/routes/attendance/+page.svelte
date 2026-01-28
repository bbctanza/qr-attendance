<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import * as Table from "$lib/components/ui/table";
    import { Badge } from "$lib/components/ui/badge";
    import { Input } from "$lib/components/ui/input";
    import { Search, Calendar, Filter, ChevronRight, Users } from "@lucide/svelte";
    import { ChevronLeft, HelpCircle, MapPin, QrCode } from "@lucide/svelte";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "$lib/components/ui/card";
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuCheckboxItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
    } from "$lib/components/ui/dropdown-menu";

    // Mock Data
    const events = [
        { id: 1, name: "Sunday Morning Service", date: "2023-10-22", attendees: 124, status: "Completed" },
        { id: 2, name: "Wednesday Bible Study", date: "2023-10-18", attendees: 45, status: "Completed" },
        { id: 3, name: "Youth Night", date: "2023-10-17", attendees: 32, status: "Completed" },
        { id: 4, name: "Leadership Meeting", date: "2023-10-15", attendees: 12, status: "Completed" },
        { id: 5, name: "Sunday Morning Service", date: "2023-10-15", attendees: 118, status: "Completed" },
        { id: 6, name: "Special Worship Night", date: "2023-10-14", attendees: 200, status: "Completed" },
    ];

    let query = "";

    $: filteredEvents = events.filter(e => e.name.toLowerCase().includes(query.toLowerCase()));
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
            <Button variant="outline" size="sm" class="uppercase">Details &nbsp; <ChevronRight class="h-3 w-3" /></Button>
        </div>
    </div>

    <!-- Session Progress -->
    <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
        <div class="flex items-start justify-between">
            <div>
                <div class="text-sm font-medium">Session Progress</div>
                <div class="text-xs text-muted-foreground mt-1">On Track</div>
            </div>
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <div class="text-xs">Elapsed</div>
                <div class="font-bold">0h 15m</div>
            </div>
        </div>
        <div class="flex items-center gap-4 mt-4">
            <!-- Circular progress -->
            <div class="w-24 h-24 rounded-full bg-linear-to-br from-card/50 to-card flex items-center justify-center">
                <svg class="w-20 h-20" viewBox="0 0 36 36">
                    <path class="text-muted-foreground/30" stroke-width="3" stroke-linecap="round" fill="none" d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831 15.9155 15.9155 0 1 1 0-31.831" stroke="currentColor"/>
                    <path class="text-(--color-primary)" stroke-width="3" stroke-linecap="round" fill="none" d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831 15.9155 15.9155 0 1 1 0-31.831" stroke-dasharray="113" stroke-dashoffset="56" stroke="currentColor"/>
                </svg>
                <div class="absolute text-center">
                    <div class="text-lg font-extrabold">45</div>
                    <div class="text-[11px] text-muted-foreground">MINS LEFT</div>
                </div>
            </div>

            <div class="flex-1">
                <div class="text-xs uppercase text-muted-foreground tracking-widest">Participation</div>
                <div class="text-2xl font-bold text-(--color-primary)">84%</div>
            </div>
        </div>
    </div>

    <!-- Small stats -->
    <div class="grid grid-cols-2 gap-3">
        <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
            <div class="text-xs text-muted-foreground uppercase tracking-widest">Live</div>
            <div class="text-2xl font-extrabold">42</div>
            <div class="text-xs text-muted-foreground">Checked In</div>
        </div>
        <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
            <div class="text-xs text-muted-foreground uppercase tracking-widest">Expected</div>
            <div class="text-2xl font-extrabold">50</div>
            <div class="text-xs text-muted-foreground">Expected</div>
        </div>
    </div>

    <!-- Late Arrivals -->
    <div class="p-4 rounded-2xl bg-card border border-border/40 shadow-sm flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div class="rounded-full bg-muted/20 p-1">
                <Avatar class="h-8 w-8 rounded-full">
                    <AvatarImage src="https://i.pravatar.cc/40?img=1" alt="Sarah" />
                </Avatar>
            </div>
            <div>
                <div class="text-sm font-medium">Late Arrivals</div>
                <div class="text-xs text-muted-foreground">3 attention</div>
            </div>
        </div>
        <div class="text-2xl font-extrabold text-stat-accent">3</div>
    </div>

    <!-- Recent Scans -->
    <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Recent Scans</h3>
        <a href="/attendance" class="text-xs text-(--color-primary) font-bold">VIEW ALL</a>
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
                            <Button variant="outline" size="sm">Details &nbsp; <ChevronRight class="h-3 w-3" /></Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Session Progress Card -->
        <Card>
            <CardContent class="p-6 flex gap-6 items-center">
                <div class="w-36 h-36 relative flex items-center justify-center">
                    <svg class="w-36 h-36" viewBox="0 0 36 36">
                        <path class="text-muted-foreground/30" stroke-width="3" stroke-linecap="round" fill="none" d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831 15.9155 15.9155 0 1 1 0-31.831" stroke="currentColor"/>
                        <path class="text-(--color-primary)" stroke-width="3" stroke-linecap="round" fill="none" d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831 15.9155 15.9155 0 1 1 0-31.831" stroke-dasharray="113" stroke-dashoffset="56" stroke="currentColor"/>
                    </svg>
                    <div class="absolute text-center">
                        <div class="text-3xl font-extrabold">45</div>
                        <div class="text-xs text-muted-foreground">MINS LEFT</div>
                    </div>
                </div>
                <div class="flex-1">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Session Progress</div>
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
        <div class="grid grid-cols-3 gap-4">
            <Card class="p-0">
                <CardContent class="p-4">
                    <div class="text-xs text-muted-foreground uppercase tracking-widest">Checked In</div>
                    <div class="text-2xl font-extrabold">42</div>
                    <div class="text-xs text-muted-foreground mt-1">Live</div>
                </CardContent>
            </Card>

            <Card class="p-0">
                <CardContent class="p-4">
                    <div class="text-xs text-muted-foreground uppercase tracking-widest">Expected</div>
                    <div class="text-2xl font-extrabold">50</div>
                    <div class="text-xs text-muted-foreground mt-1">Expected</div>
                </CardContent>
            </Card>

            <Card class="p-0">
                <CardContent class="p-4 flex items-center justify-between">
                    <div>
                        <div class="text-xs font-medium">Late Arrivals</div>
                        <div class="text-sm text-muted-foreground mt-1">3 attention</div>
                    </div>
                    <div class="text-2xl font-extrabold text-stat-accent">3</div>
                </CardContent>
            </Card>
        </div>
    </div>

    <!-- Right / Sidebar -->
    <aside class="col-span-1 space-y-6">
        <Card>
            <CardHeader class="flex items-center justify-between">
                <div>
                    <CardTitle>Recent Scans</CardTitle>
                    <CardDescription>Latest check-ins</CardDescription>
                </div>
                <a href="/attendance" class="text-xs text-(--color-primary) font-bold">View all</a>
            </CardHeader>
            <CardContent class="space-y-3">
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
        </Card>

        <!-- Sticky scan action -->
        <div class="sticky top-36">
            <Button class="w-full h-14 rounded-xl bg-(--color-primary) text-(--color-primary-foreground) font-bold" onclick={() => {/* open scanner */}}>
                Open Scanner
            </Button>
        </div>
    </aside>
</div>

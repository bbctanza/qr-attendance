<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import * as Table from "$lib/components/ui/table";
    import { Badge } from "$lib/components/ui/badge";
    import { Input } from "$lib/components/ui/input";
    import { Search, Calendar, Filter, ChevronRight, Users } from "@lucide/svelte";
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
    <div class="flex flex-col gap-2">
        <h2 class="text-2xl font-bold tracking-tight">History</h2>
        <p class="text-xs text-muted-foreground">View past events and records.</p>
    </div>

    <div class="flex items-center gap-2">
        <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
                type="search"
                placeholder="Search events..."
                class="w-full bg-card/20 border-2 border-border/20 rounded-2xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:border-primary ring-primary/20 shadow-sm"
                bind:value={query}
            />
        </div>
        <Button variant="outline" size="icon" class="rounded-2xl border-border/40 bg-card h-12 w-12">
            <Filter class="h-5 w-5" />
        </Button>
    </div>

    <div class="space-y-3">
        {#each filteredEvents as event}
            <div class="p-5 rounded-3xl bg-card border border-border/40 shadow-sm active:scale-[0.99] transition-all space-y-4">
                <div class="flex items-start justify-between">
                    <div class="space-y-1">
                        <div class="text-sm font-bold tracking-tight">{event.name}</div>
                        <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                            <Calendar class="h-3 w-3" />
                            {event.date}
                        </div>
                    </div>
                    <Badge variant="outline" class="text-[10px] h-5 px-1.5 uppercase font-black tracking-widest text-primary border-primary/20 bg-primary/5">
                        {event.status}
                    </Badge>
                </div>
                
                <div class="flex items-center justify-between pt-2 border-t border-border/20">
                    <div class="flex items-center gap-2">
                        <div class="p-1.5 rounded-lg bg-muted/30">
                            <Users class="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div class="text-xs font-bold">{event.attendees} <span class="text-muted-foreground font-normal">Attendees</span></div>
                    </div>
                    <button class="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary">
                        REPORT <ChevronRight class="h-3 w-3" />
                    </button>
                </div>
            </div>
        {/each}
        
        {#if filteredEvents.length === 0}
            <div class="py-12 text-center text-muted-foreground">
                <p>No records found</p>
            </div>
        {/if}
    </div>
</div>

<!-- Desktop View -->
<div class="hidden md:flex flex-col gap-4 p-4 lg:p-6">
    <div class="flex items-center justify-between">
        <div>
            <h2 class="text-3xl font-bold tracking-tight">Attendance History</h2>
            <p class="text-muted-foreground">View past events and attendance records.</p>
        </div>
        <div class="flex items-center gap-2">
            <Button variant="outline" size="sm">
                <Calendar class="mr-2 h-4 w-4" /> Date Range
            </Button>
            <Button variant="outline" size="sm">
                <Filter class="mr-2 h-4 w-4" /> Filter
            </Button>
        </div>
    </div>

    <!-- Filters -->
    <div class="flex items-center py-4">
        <Input 
            placeholder="Search events..." 
            class="max-w-sm" 
            bind:value={query}
        />
    </div>

    <!-- Table -->
    <div class="rounded-md border bg-card">
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head class="min-w-45">Event Name</Table.Head>
                    <Table.Head>Date</Table.Head>
                    <Table.Head>Attendees</Table.Head>
                    <Table.Head>Status</Table.Head>
                    <Table.Head class="text-right">Action</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {#each filteredEvents as event}
                    <Table.Row>
                        <Table.Cell class="font-medium">{event.name}</Table.Cell>
                        <Table.Cell>{event.date}</Table.Cell>
                        <Table.Cell>{event.attendees}</Table.Cell>
                        <Table.Cell>
                            <Badge variant="outline" class="bg-green-500/10 text-green-600 border-green-200">
                                {event.status}
                            </Badge>
                        </Table.Cell>
                        <Table.Cell class="text-right">
                            <Button variant="ghost" size="sm">View Report</Button>
                        </Table.Cell>
                    </Table.Row>
                {/each}
            </Table.Body>
        </Table.Root>
    </div>
</div>


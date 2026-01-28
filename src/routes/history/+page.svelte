<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import * as Table from "$lib/components/ui/table";
    import { Badge } from "$lib/components/ui/badge";
    import { Input } from "$lib/components/ui/input";
    import { Search, Calendar, Filter } from "@lucide/svelte";
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
</script>

<div class="flex flex-col gap-4 p-4 lg:p-6">
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
                    <Table.Head>Event Name</Table.Head>
                    <Table.Head>Date</Table.Head>
                    <Table.Head>Attendees</Table.Head>
                    <Table.Head>Status</Table.Head>
                    <Table.Head class="text-right">Action</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {#each events.filter(e => e.name.toLowerCase().includes(query.toLowerCase())) as event}
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

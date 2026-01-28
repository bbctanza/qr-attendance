<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { QrCode, Users, UserCheck, UserX, Calendar, ArrowUpRight, Plus, UserPlus } from '@lucide/svelte';
	import { automation } from '$lib/logic/automation';
	import { onMount } from 'svelte';
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

    const stats = {
        total: 128,
        present: 86,
        absent: 42
    };

    const recentEvents = [
        { name: "Wednesday Bible Study", date: "Oct 24", rate: 92, status: 'completed' },
        { name: "Youth Night", date: "Oct 22", rate: 78, status: 'completed' },
        { name: "Sunday Service", date: "Oct 20", rate: 88, status: 'completed' },
        { name: "Leaders Meeting", date: "Oct 18", rate: 45, status: 'completed' },
    ];

    function getRateColor(rate: number) {
        if (rate >= 90) return "bg-green-500/10 text-green-500 border-green-500/20";
        if (rate >= 75) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
        return "bg-red-500/10 text-red-500 border-red-500/20";
    }

</script>

<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
    <!-- Top Header / Quick Actions for Mobile -->
    <div class="flex items-center justify-end space-y-2">
        <div class="flex items-center space-x-2">
            <Button size="sm" class="hidden md:flex bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus class="mr-2 h-4 w-4" /> New Event
            </Button>
        </div>
    </div>
    
    <!-- Live Event Card (Banner Style) -->
	<Card class="relative overflow-hidden border-border bg-linear-to-br from-card to-card/50 shadow-lg">
        <!-- Decoration background -->
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
                <Button size="lg" class="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 font-bold" href="/scan">
                    <QrCode class="mr-2 h-5 w-5" />
                    Scan Attendees
                </Button>
            </div>
		</CardContent>
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
                    <div class="h-1 rounded-full bg-green-500" style="width: {(stats.present / stats.total) * 100}%"></div>
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
                    <div class="h-1 rounded-full bg-red-500" style="width: {(stats.absent / stats.total) * 100}%"></div>
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

        <!-- Quick Actions Cards -->
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
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20 text-purple-500 mb-2">
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

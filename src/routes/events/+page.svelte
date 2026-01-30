<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Switch } from "$lib/components/ui/switch";
	import { Calendar, Clock, MapPin, Edit, Trash2, Plus, Check } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from "$lib/components/ui/sheet";
	import { Label } from "$lib/components/ui/label";
	import { Input } from "$lib/components/ui/input";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Select from "$lib/components/ui/select";

	// Mock data
	let totalEvents = 12;
	let activeEvents = 8;
	let inactiveEvents = 4;

	let recurringEvents = [
		{
			id: 1,
			title: "Sunday Morning Service",
			schedule: "Every Sunday",
			time: "09:00 AM - 11:00 AM",
			place: "Main Sanctuary",
			active: true
		},
		{
			id: 2,
			title: "Wednesday Bible Study",
			schedule: "Every Wednesday",
			time: "07:00 PM - 08:30 PM",
			place: "Fellowship Hall",
			active: true
		},
		{
			id: 3,
			title: "Monthly Prayer Meeting",
			schedule: "1st Saturday of month",
			time: "10:00 AM - 12:00 PM",
			place: "Prayer Room",
			active: false
		}
	];

	let customEvents = [
		{
			id: 4,
			title: "Q3 Planning Session",
			date: "2023-10-24",
			time: "02:00 PM - 04:00 PM",
			place: "Conference Room A",
			active: true
		},
		{
			id: 5,
			title: "Design Workshop A",
			date: "2023-10-20",
			time: "10:00 AM - 12:00 PM",
			place: "Design Studio",
			active: true
		}
	];

	let pastEvents = [
		{
			id: 6,
			title: "Annual Retreat",
			date: "2023-09-15",
			time: "09:00 AM - 05:00 PM",
			place: "Mountain Resort"
		}
	];

	function toggleActive(id: number, type: 'recurring' | 'custom') {
		let eventTitle = '';
		let wasActive = false;
		
		if (type === 'recurring') {
			const event = recurringEvents.find(e => e.id === id);
			if (event) {
				wasActive = event.active;
				event.active = !event.active;
				eventTitle = event.title;
			}
		} else {
			const event = customEvents.find(e => e.id === id);
			if (event) {
				wasActive = event.active;
				event.active = !event.active;
				eventTitle = event.title;
			}
		}
		
		// Update counts
		activeEvents = recurringEvents.filter(e => e.active).length + customEvents.filter(e => e.active).length;
		inactiveEvents = recurringEvents.filter(e => !e.active).length + customEvents.filter(e => !e.active).length;
		
		// Show toast
		if (eventTitle) {
			const action = wasActive ? 'deactivated' : 'activated';
			toast.success(`"${eventTitle}" has been ${action}`);
		}
	}

	function editEvent(id: number) {
		// Placeholder
		console.log('Edit event', id);
	}

	function deleteEvent(id: number) {
		// Placeholder
		console.log('Delete event', id);
	}

	// Add Event Dialog State
	let showAddEventDialog = false;
	let weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
	let newEvent: any = {
		name: '',
		type: 'recurring', // 'recurring' | 'custom'
		schedule: 'weekly', // 'weekly' | 'monthly' | 'one-time'
		days: [], // for weekly
		monthlyOrdinal: 'First',
		monthlyWeekday: 'Monday',
		date: '', // for one-time/custom
		startTime: '',
		endTime: '',
		location: ''
	};

	function addEvent() {
		showAddEventDialog = true;
	}

	function toggleWeekday(day: string) {
		const idx = newEvent.days.indexOf(day);
		if (idx === -1) newEvent.days.push(day);
		else newEvent.days.splice(idx, 1);
	}

	function addNewEvent() {
		if (!newEvent.name.trim()) {
			toast.error('Please enter event name');
			return;
		}

		const existingIds = [...recurringEvents.map(e => e.id), ...customEvents.map(e => e.id)];
		const nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;

		if (newEvent.type === 'recurring') {
			let scheduleLabel = '';
			if (newEvent.schedule === 'weekly') scheduleLabel = newEvent.days.join(', ');
			else if (newEvent.schedule === 'monthly') scheduleLabel = `${newEvent.monthlyOrdinal} ${newEvent.monthlyWeekday}`;
			else scheduleLabel = newEvent.date || '';

			recurringEvents = [
				...recurringEvents,
				{ id: nextId, title: newEvent.name, schedule: scheduleLabel, time: `${newEvent.startTime} - ${newEvent.endTime}`, place: newEvent.location, active: true }
			];
		} else {
			customEvents = [
				...customEvents,
				{ id: nextId, title: newEvent.name, date: newEvent.date, time: `${newEvent.startTime} - ${newEvent.endTime}`, place: newEvent.location, active: true }
			];
		}

		totalEvents = recurringEvents.length + customEvents.length;
		activeEvents = recurringEvents.filter(e => e.active).length + customEvents.filter(e => e.active).length;
		inactiveEvents = totalEvents - activeEvents;

		toast.success(`"${newEvent.name}" created`);

		// reset form
		newEvent = {
			name: '',
			type: 'recurring',
			schedule: 'weekly',
			days: [],
			monthlyOrdinal: 'First',
			monthlyWeekday: 'Monday',
			date: '',
			startTime: '',
			endTime: '',
			location: ''
		};
		showAddEventDialog = false;
	}
</script>

<div class="flex flex-col gap-4 md:gap-6 p-4 md:px-12 md:py-10 lg:px-16 lg:py-12 max-w-7xl mx-auto">

	<!-- Header with Add Button -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h1 class="hidden sm:block text-2xl md:text-3xl font-bold">Events Management</h1>
			<p class="hidden sm:block text-muted-foreground mt-1">Manage recurring and custom events for your organization</p>
		</div>
		<Button onclick={addEvent} class="w-full sm:w-auto">
			<Plus class="mr-2 h-4 w-4" />
			Add New Event
		</Button>
	</div>

	<!-- Add Event Sheet -->
	<Sheet bind:open={showAddEventDialog}>
		<SheetContent class="sm:max-w-2xl">
			<SheetHeader>
				<SheetTitle class="text-lg font-semibold">Add New Event</SheetTitle>
			</SheetHeader>
			<div class="px-4 pb-4">
				<div class="text-sm text-muted-foreground mb-4">Create a new recurring or custom event</div>
				<div class="space-y-4">
					<!-- Event Name -->
					<div>
						<Label for="eventName" class="text-xs font-bold tracking-wider uppercase">Event Name</Label>
						<Input id="eventName" type="text" placeholder="e.g. Sunday Service" bind:value={newEvent.name} class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input w-full" />
					</div>

					<!-- Type & Schedule -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Type</Label>
							<Select.Root type="single" bind:value={newEvent.type}>
								<Select.Trigger class="mt-2 rounded-xl py-3 w-full border-input text-left">
									{newEvent.type === 'recurring' ? 'Recurring' : 'Custom / One-time'}
								</Select.Trigger>
								<Select.Content class="bg-popover border-border/40 rounded-xl">
									<Select.Item value="recurring">Recurring</Select.Item>
									<Select.Item value="custom">Custom / One-time</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Schedule</Label>
							<Select.Root type="single" bind:value={newEvent.schedule}>
								<Select.Trigger class="mt-2 rounded-xl py-3 w-full border-input text-left">
									{newEvent.schedule === 'weekly' ? 'Weekly' : newEvent.schedule === 'monthly' ? 'Monthly' : 'One-time'}
								</Select.Trigger>
								<Select.Content class="bg-popover border-border/40 rounded-xl">
									<Select.Item value="weekly">Weekly</Select.Item>
									<Select.Item value="monthly">Monthly</Select.Item>
									<Select.Item value="one-time">One-time</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<!-- Weekly Days -->
					{#if newEvent.schedule === 'weekly'}
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Days of Week</Label>
							<div class="grid grid-cols-4 gap-2 mt-2">
								{#each weekdays as day}
									<button
										type="button"
										class="flex items-center gap-2 text-sm rounded px-2 py-1 hover:bg-muted/30"
										aria-pressed={newEvent.days.includes(day)}
										on:click={() => toggleWeekday(day)}
										on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleWeekday(day))}
									>
										<div class="size-4 rounded-sm border border-border flex items-center justify-center">
											{#if newEvent.days.includes(day)}
												<Check class="size-3 text-primary" />
											{/if}
										</div>
										<span>{day.slice(0,3)}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Monthly Rule -->
					{#if newEvent.schedule === 'monthly'}
						<div class="grid grid-cols-2 gap-3">
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Ordinal</Label>
								<Select.Root type="single" bind:value={newEvent.monthlyOrdinal}>
									<Select.Trigger class="mt-2 rounded-xl py-3 w-full border-input text-left">{newEvent.monthlyOrdinal}</Select.Trigger>
									<Select.Content class="bg-popover border-border/40 rounded-xl">
									<Select.Item value="First">First</Select.Item>
									<Select.Item value="Second">Second</Select.Item>
									<Select.Item value="Third">Third</Select.Item>
									<Select.Item value="Fourth">Fourth</Select.Item>
									<Select.Item value="Last">Last</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Weekday</Label>
								<Select.Root type="single" bind:value={newEvent.monthlyWeekday}>
									<Select.Trigger class="mt-2 rounded-xl py-3 w-full border-input text-left">{newEvent.monthlyWeekday}</Select.Trigger>
									<Select.Content class="bg-popover border-border/40 rounded-xl">
										{#each weekdays as day}
											<Select.Item value={day}>{day}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						</div>
					{/if}

					<!-- One-time Date (custom) -->
					{#if newEvent.schedule === 'one-time' || newEvent.type === 'custom'}
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Date</Label>
							<Input id="eventDate" type="date" bind:value={newEvent.date} class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
					{/if}

					<!-- Time & Location -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Start Time</Label>
							<Input id="startTime" type="time" bind:value={newEvent.startTime} class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">End Time</Label>
							<Input id="endTime" type="time" bind:value={newEvent.endTime} class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
					</div>

					<div>
						<Label class="text-xs font-bold tracking-wider uppercase">Location</Label>
						<Input id="location" type="text" bind:value={newEvent.location} placeholder="e.g. Main Sanctuary" class="mt-2 rounded-xl py-3 w-full border-input" />
					</div>
				</div>
			</div>

			<SheetFooter class="flex gap-3 px-4 pb-4">
				<Button class="w-full md:w-auto bg-muted hover:bg-muted/90" onclick={() => (showAddEventDialog = false)}>Cancel</Button>
				<Button class="w-full md:w-auto" onclick={addNewEvent}>Save Event</Button>
			</SheetFooter>
		</SheetContent>
	</Sheet>

	<!-- Stats Cards -->
	<div class="grid grid-cols-3 gap-2">
		<Card>
			<CardContent class="flex flex-col items-center justify-center p-4">
				<Calendar class="h-6 w-6 text-muted-foreground mb-2" />
				<div class="text-2xl font-bold mb-1">{totalEvents}</div>
				<div class="text-sm font-medium text-center">Total Events</div>
			</CardContent>
		</Card>
		<Card>
			<CardContent class="flex flex-col items-center justify-center p-4">
				<Calendar class="h-6 w-6 text-green-500 mb-2" />
				<div class="text-2xl font-bold text-green-500 mb-1">{activeEvents}</div>
				<div class="text-sm font-medium text-center">Active Events</div>
			</CardContent>
		</Card>
		<Card>
			<CardContent class="flex flex-col items-center justify-center p-4">
				<Calendar class="h-6 w-6 text-red-500 mb-2" />
				<div class="text-2xl font-bold text-red-500 mb-1">{inactiveEvents}</div>
				<div class="text-sm font-medium text-center">Inactive Events</div>
			</CardContent>
		</Card>
	</div>

	<!-- Recurring and Custom Events Side by Side -->
	<div class="grid gap-4 md:gap-6 lg:grid-cols-2">
		<!-- Recurring Events -->
		<div>
			<h2 class="text-xl font-semibold mb-4">Recurring Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each recurringEvents as event}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
								<h3 class="font-medium truncate text-sm sm:text-base">{event.title}</h3>
								<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											<span class="truncate">{event.schedule}</span>
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-3 w-3" />
											{event.time}
										</div>
										<div class="flex items-center gap-1">
											<MapPin class="h-3 w-3" />
											<span class="truncate">{event.place}</span>
										</div>
									</div>
								</div>
								<div class="flex items-center gap-1 ml-2 shrink-0">
									<Switch checked={event.active} onchange={() => toggleActive(event.id, 'recurring')} />
									<Button variant="ghost" size="sm" onclick={() => editEvent(event.id)}>
										<Edit class="h-4 w-4" />
									</Button>
									<Button variant="ghost" size="sm" onclick={() => deleteEvent(event.id)}>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		</div>

		<!-- Custom Events -->
		<div>
			<h2 class="text-xl font-semibold mb-4">Custom Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each customEvents as event}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
								<h3 class="font-medium truncate text-sm sm:text-base">{event.title}</h3>
								<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											<span class="truncate">{new Date(event.date).toLocaleDateString()}</span>
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-3 w-3" />
											{event.time}
										</div>
										<div class="flex items-center gap-1">
											<MapPin class="h-3 w-3" />
											<span class="truncate">{event.place}</span>
										</div>
									</div>
								</div>
								<div class="flex items-center gap-1 ml-2 shrink-0">
									<Switch checked={event.active} onchange={() => toggleActive(event.id, 'custom')} />
									<Button variant="ghost" size="sm" onclick={() => editEvent(event.id)}>
										<Edit class="h-4 w-4" />
									</Button>
									<Button variant="ghost" size="sm" onclick={() => deleteEvent(event.id)}>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		</div>
	</div>

	<!-- Past Events -->
	{#if pastEvents.length > 0}
		<div>
			<h2 class="text-xl font-semibold mb-4">Past Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each pastEvents as event}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div>
									<h3 class="font-medium">{event.title}</h3>
									<div class="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-4 w-4" />
											{new Date(event.date).toLocaleDateString()}
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-4 w-4" />
											{event.time}
										</div>
										<div class="flex items-center gap-1">
											<MapPin class="h-4 w-4" />
											{event.place}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		</div>
	{/if}

</div>
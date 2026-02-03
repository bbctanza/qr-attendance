<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Switch } from "$lib/components/ui/switch";
	import { Calendar, Clock, MapPin, Edit, Trash2, Plus, Check } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "$lib/components/ui/drawer";
	import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "$lib/components/ui/sheet";
	import { Label } from "$lib/components/ui/label";
	import { Input } from "$lib/components/ui/input";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Select from "$lib/components/ui/select";
	import { supabase } from "$lib/supabase";
	import { onMount } from "svelte";

	// Data
	let events = $state<any[]>([]);
	let totalEvents = $derived(events.length);
	let activeEvents = $derived(events.filter(e => e.status === 'Active').length);
	let inactiveEvents = $derived(events.filter(e => e.status !== 'Active').length);

	// Computed lists for the UI
	let recurringEvents = $derived(events.filter(e => e.type === 'Recurring'));
	let customEvents = $derived(events.filter(e => e.type === 'Custom' || (e.type === 'One-time' && new Date(e.event_date) >= new Date())));
	let pastEvents = $derived(events.filter(e => e.type === 'One-time' && new Date(e.event_date) < new Date()));

    let isMobile = $state(false);

	onMount(() => {
		fetchEvents();

        if (typeof window !== 'undefined') {
            const mediaQuery = window.matchMedia('(min-width: 640px)');
            isMobile = !mediaQuery.matches;
            
            const handleChange = (e: MediaQueryListEvent) => {
                isMobile = !e.matches;
            };
            
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
	});

	async function fetchEvents() {
		const { data, error } = await supabase
			.from('events')
			.select('*')
			.order('created_at', { ascending: false });
		
		if (error) {
			toast.error("Failed to fetch events");
			console.error(error);
			return;
		}
		events = data || [];
	}

	async function toggleActive(id: string) {
		const event = events.find(e => e.event_id === id);
		if (!event) return;

		const newStatus = event.status === 'Active' ? 'Inactive' : 'Active';
		
		const { error } = await supabase
			.from('events')
			.update({ status: newStatus })
			.eq('event_id', id);

		if (error) {
			toast.error("Failed to update status");
			return;
		}

		events = events.map(e => e.event_id === id ? { ...e, status: newStatus } : e);
		toast.success(`"${event.name}" has been ${newStatus.toLowerCase()}`);
	}

	let isEditing = $state(false);
	let editingId: string | null = $state(null);

	function editEvent(id: string) {
		const e = events.find(event => event.event_id === id);
		if (!e) return;

		newEvent = {
			name: e.name,
			type: e.type === 'Recurring' ? 'recurring' : 'custom',
			schedule: e.type === 'Recurring' ? (e.schedule.includes(',') ? 'weekly' : 'monthly') : 'one-time',
			days: e.type === 'Recurring' && e.schedule.includes(',') ? e.schedule.split(',').map((s: string) => s.trim()) : [],
			monthlyOrdinal: 'First', // Fallback as DB schema might not have this detailed breakdown
			monthlyWeekday: 'Monday',
			date: e.event_date || '',
			startTime: e.start_time || '',
			endTime: e.end_time || '',
			location: e.location || ''
		};

		isEditing = true;
		editingId = id;
		showAddEventDialog = true;
	}

	async function deleteEvent(id: string) {
		if (!confirm("Are you sure you want to delete this event?")) return;

		const { error } = await supabase
			.from('events')
			.delete()
			.eq('event_id', id);

		if (error) {
			toast.error("Failed to delete event");
			return;
		}

		events = events.filter(e => e.event_id !== id);
		toast.success("Event deleted");
	}

	// Add Event Dialog State
	let showAddEventDialog = $state(false);
	let weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
	let newEvent: any = $state({
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
	});

	// Auto-update schedule when type changes
	$effect(() => {
		if (newEvent.type === 'custom' && newEvent.schedule !== 'one-time') {
			newEvent.schedule = 'one-time';
		} else if (newEvent.type === 'recurring' && newEvent.schedule === 'one-time') {
			newEvent.schedule = 'weekly';
		}
	});

	function addEvent() {
		isEditing = false;
		editingId = null;
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
		showAddEventDialog = true;
	}

	function toggleWeekday(day: string) {
		const idx = newEvent.days.indexOf(day);
		if (idx === -1) newEvent.days.push(day);
		else newEvent.days.splice(idx, 1);
	}

	async function addNewEvent() {
		if (!newEvent.name.trim()) {
			toast.error('Please enter event name');
			return;
		}

		const scheduleLabel = newEvent.type === 'recurring' 
			? (newEvent.schedule === 'weekly' ? newEvent.days.join(', ') : `${newEvent.monthlyOrdinal} ${newEvent.monthlyWeekday}`)
			: '';

		const payload = {
			name: newEvent.name,
			type: newEvent.type === 'recurring' ? 'Recurring' : 'One-time',
			schedule: scheduleLabel,
			event_date: newEvent.type === 'recurring' ? null : newEvent.date,
			start_time: newEvent.startTime,
			end_time: newEvent.endTime,
			location: newEvent.location,
			status: 'Active'
		};

		if (isEditing && editingId) {
			const { error } = await supabase
				.from('events')
				.update(payload)
				.eq('event_id', editingId);

			if (error) {
				toast.error("Failed to update event");
				return;
			}
			toast.success("Event updated");
		} else {
			const { data, error } = await supabase
				.from('events')
				.insert([payload])
				.select();

			if (error) {
				toast.error("Failed to add event");
				return;
			}
			toast.success("Event added");
		}

		showAddEventDialog = false;
		fetchEvents();
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

	<!-- Add Event Drawer (Mobile) -->
	{#if isMobile}
		<Drawer bind:open={showAddEventDialog}>
			<DrawerContent class="max-h-[90vh]">
			<DrawerHeader>
			<DrawerTitle class="text-lg font-semibold">{isEditing ? 'Edit Event' : 'Add New Event'}</DrawerTitle>
			</DrawerHeader>
			<div class="px-4 pb-4 overflow-y-auto max-h-[calc(90vh-180px)]">
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
										<Select.Item value="weekly" disabled={newEvent.type === 'custom'}>Weekly</Select.Item>
										<Select.Item value="monthly" disabled={newEvent.type === 'custom'}>Monthly</Select.Item>
										<Select.Item value="one-time" disabled={newEvent.type === 'recurring'}>One-time</Select.Item>
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
									onclick={() => toggleWeekday(day)}
									onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleWeekday(day))}
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

			<DrawerFooter class="flex gap-3 px-4 pb-4 border-t">
			<Button class="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground" onclick={() => (showAddEventDialog = false)}>Cancel</Button>
				<Button class="w-full" onclick={addNewEvent}>{isEditing ? 'Update Event' : 'Save Event'}</Button>
			</DrawerFooter>
		</DrawerContent>
	</Drawer>
	{/if}

	<!-- Add Event Sheet (Desktop) -->
	{#if !isMobile}
		<Sheet bind:open={showAddEventDialog}>
		<SheetContent class="sm:max-w-2xl hidden sm:flex flex-col">
			<SheetHeader>
				<SheetTitle class="text-lg font-semibold">{isEditing ? 'Edit Event' : 'Add New Event'}</SheetTitle>
			</SheetHeader>
			<div class="px-4 pb-4 overflow-y-auto flex-1">
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
								<Select.Item value="weekly" disabled={newEvent.type === 'custom'}>Weekly</Select.Item>
								<Select.Item value="monthly" disabled={newEvent.type === 'custom'}>Monthly</Select.Item>
								<Select.Item value="one-time" disabled={newEvent.type === 'recurring'}>One-time</Select.Item>
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
										onclick={() => toggleWeekday(day)}
										onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleWeekday(day))}
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
			<Button class="w-full md:w-auto bg-secondary hover:bg-secondary/80 text-secondary-foreground" onclick={() => (showAddEventDialog = false)}>Cancel</Button>
				<Button class="w-full md:w-auto" onclick={addNewEvent}>{isEditing ? 'Update Event' : 'Save Event'}</Button>
			</SheetFooter>
		</SheetContent>
	</Sheet>
	{/if}

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
				{#each recurringEvents as event (event.event_id)}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
								<h3 class="font-medium truncate text-sm sm:text-base">{event.name}</h3>
								<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											<span class="truncate">{event.schedule}</span>
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-3 w-3" />
											{event.start_time} - {event.end_time}
										</div>
										<div class="flex items-center gap-1">
											<MapPin class="h-3 w-3" />
											<span class="truncate">{event.location}</span>
										</div>
									</div>
								</div>
								<div class="flex items-center gap-1 ml-2 shrink-0">
									<Switch checked={event.status === 'Active'} onCheckedChange={() => toggleActive(event.event_id)} />
									<Button variant="ghost" size="sm" onclick={() => editEvent(event.event_id)}>
										<Edit class="h-4 w-4" />
									</Button>
									<Button variant="ghost" size="sm" onclick={() => deleteEvent(event.event_id)}>
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
			<h2 class="text-xl font-semibold mb-4">Upcoming Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each customEvents as event (event.event_id)}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
								<h3 class="font-medium truncate text-sm sm:text-base">{event.name}</h3>
								<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											<span class="truncate">{event.event_date ? new Date(event.event_date).toLocaleDateString() : 'N/A'}</span>
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-3 w-3" />
											{event.start_time} - {event.end_time}
										</div>
										<div class="flex items-center gap-1">
											<MapPin class="h-3 w-3" />
											<span class="truncate">{event.location}</span>
										</div>
									</div>
								</div>
								<div class="flex items-center gap-1 ml-2 shrink-0">
									<Switch checked={event.status === 'Active'} onCheckedChange={() => toggleActive(event.event_id)} />
									<Button variant="ghost" size="sm" onclick={() => editEvent(event.event_id)}>
										<Edit class="h-4 w-4" />
									</Button>
									<Button variant="ghost" size="sm" onclick={() => deleteEvent(event.event_id)}>
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
			<h2 class="text-xl font-semibold mb-4 text-muted-foreground">Past Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each pastEvents as event (event.event_id)}
					<Card class="opacity-70">
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div>
									<h3 class="font-medium">{event.name}</h3>
									<div class="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-4 w-4" />
											{event.event_date ? new Date(event.event_date).toLocaleDateString() : 'N/A'}
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-4 w-4" />
											{event.start_time} - {event.end_time}
										</div>
										<div class="flex items-center gap-1">
											<MapPin class="h-4 w-4" />
											{event.location}
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
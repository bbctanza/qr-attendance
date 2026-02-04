<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Switch } from "$lib/components/ui/switch";
	import { Badge } from "$lib/components/ui/badge";
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
    import FullPageLoading from "$lib/components/full-page-loading.svelte";
    import { eventTypesApi } from "$lib/api/event_types";
    import { goto } from "$app/navigation";
    import { CalendarRange, Settings2 } from "lucide-svelte";

	// Data
	const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
	let recurringEventTypes = $state<any[]>([]);
	let upcomingCustomEvents = $state<any[]>([]);
	let allCustomEvents = $state<any[]>([]);
	let pastCustomEvents = $derived(allCustomEvents.filter(e => e.row_status === 'completed'));
	let totalEvents = $derived(recurringEventTypes.length + upcomingCustomEvents.length);
	let activeRecurring = $derived(recurringEventTypes.filter(e => e.is_active).length);
	let inactiveRecurring = $derived(recurringEventTypes.filter(e => !e.is_active).length);

    let isMobile = $state(false);
    let isLoading = $state(true);

	function formatTime(dateString: string): string {
		const date = new Date(dateString);
		const use12HourFormat = localStorage.getItem('time_format') === '12h';
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: use12HourFormat });
	}

	onMount(() => {
        const load = async () => {
            isLoading = true;
            try {
                // Auto-generate recurring events for only the next 7 days (1 week)
                const today = new Date();
                const nextWeek = new Date(today);
                nextWeek.setDate(today.getDate() + 7);
                
                const startDate = today.toISOString().split('T')[0];
                const endDate = nextWeek.toISOString().split('T')[0];
                
                try {
                    const count = await eventTypesApi.generateEvents(startDate, endDate);
                    if (count > 0) console.log(`Generated ${count} recurring events for next week`);
                } catch (genError) {
                    console.error('Failed to generate recurring events:', genError);
                    // Continue anyway - don't block the page
                }
                
                await fetchData();
            } finally {
                isLoading = false;
            }
        };
        load();

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

	async function fetchData() {
		// 1. Fetch recurring event types
		const { data: types, error: typesError } = await supabase
            .from('event_types')
            .select('*')
            .order('day_of_week', { ascending: true })
            .order('start_time', { ascending: true });
		
		if (typesError) {
			toast.error("Failed to fetch event types");
			console.error(typesError);
			return;
		}

		// Process event types into UI format
		recurringEventTypes = (types || []).map(row => ({
			event_id: `type-${row.event_type_id}`,
			db_id: row.event_type_id,
			name: row.name,
			type: 'Recurring',
			day_of_week: row.day_of_week,
			day_name: weekdays[row.day_of_week],
			start_time: row.start_time,
			end_time: row.end_time,
			start_time_formatted: formatTime(`2000-01-01T${row.start_time}`),
			end_time_formatted: formatTime(`2000-01-01T${row.end_time}`),
			is_active: row.is_active,
			status: row.is_active ? 'Active' : 'Inactive',
			is_template: true,
			_raw: row
		}));

		// 2. Fetch custom events (event_type_id IS NULL) - both upcoming and completed
		const { data: customEvents, error: customError } = await supabase
            .from('events')
            .select('*')
            .is('event_type_id', null)
            .order('event_date', { ascending: true })
            .order('start_datetime', { ascending: true });
		
		if (customError) {
			toast.error("Failed to fetch custom events");
			console.error(customError);
			return;
		}

		// Process all custom events
		allCustomEvents = (customEvents || []).map(row => ({
			event_id: `custom-${row.event_id}`,
			db_id: row.event_id,
			name: row.event_name,
			type: 'Custom',
			event_date: row.event_date,
			start_time: formatTime(row.start_datetime),
			end_time: formatTime(row.end_datetime),
			location: row.metadata?.location || '',
			status: row.status === 'completed' ? 'Inactive' : 'Active',
			is_template: false,
            row_status: row.status,
			_raw: row
		}));

		// Separate upcoming from all custom events
		upcomingCustomEvents = allCustomEvents.filter(e => e.row_status !== 'completed');
	}

	async function toggleActive(id: string) {
		const isRecurring = id.startsWith('type-');
		
		if (isRecurring) {
			const eventType = recurringEventTypes.find(e => e.event_id === id);
			if (!eventType) return;

			const newStatus = !eventType.is_active;
			const { error } = await supabase
				.from('event_types')
				.update({ is_active: newStatus })
				.eq('event_type_id', eventType.db_id);

			if (error) { toast.error("Failed to update status"); return; }
			toast.success(`"${eventType.name}" has been ${newStatus ? 'activated' : 'deactivated'}`);
		} else {
			const customEvent = upcomingCustomEvents.find(e => e.event_id === id);
			if (!customEvent) return;

			// Check if trying to deactivate an ongoing event
			if (customEvent.row_status === 'ongoing' && customEvent.status === 'Active') {
				toast.error("Cannot deactivate an ongoing event. Delete it instead.");
				return;
			}

			const newStatus = customEvent.status === 'Active' ? 'completed' : 'upcoming';
			const { error } = await supabase
				.from('events')
				.update({ status: newStatus })
				.eq('event_id', customEvent.db_id);

			if (error) { toast.error("Failed to update status"); return; }
			toast.success(`"${customEvent.name}" has been ${newStatus === 'completed' ? 'deactivated' : 'activated'}`);
		}
		
		fetchData();
	}

	let isEditing = $state(false);
	let editingId: string | null = $state(null);

	function editEvent(id: string) {
		// Find in recurring event types or custom events
		let e = recurringEventTypes.find(event => event.event_id === id);
		
		if (!e) {
			e = upcomingCustomEvents.find(event => event.event_id === id);
		}

		if (!e) return;

		const raw = e._raw;
		isEditing = true;
		editingId = id;

		if (e.type === 'Recurring') {
			newEvent = {
				name: raw.name,
				type: 'recurring',
				schedule: 'weekly',
				days: [weekdays[raw.day_of_week]],
				monthlyOrdinal: 'First',
				monthlyWeekday: 'Monday',
				date: '',
				startTime: raw.start_time.slice(0, 5),
				endTime: raw.end_time.slice(0, 5),
				location: raw.metadata?.location || ''
			};
		} else {
			newEvent = {
				name: e.name,
				type: 'custom',
				schedule: 'one-time',
				days: [],
				monthlyOrdinal: 'First',
				monthlyWeekday: 'Monday',
				date: e.event_date || '',
				startTime: e.start_time || '',
				endTime: e.end_time || '',
				location: e.location || ''
			};
		}

		showAddEventDialog = true;
	}

	async function deleteEvent(id: string) {
		const customEvent = upcomingCustomEvents.find(e => e.event_id === id);
		if (!customEvent) return;

		// Check if event has attendance scans
		const { count: scanCount } = await supabase
			.from('attendance_scans')
			.select('*', { count: 'exact', head: true })
			.eq('event_id', customEvent.db_id);

		if (scanCount && scanCount > 0) {
			toast.error("Cannot delete events with attendance records. Archive them instead.");
			return;
		}

		// Only allow deletion of upcoming custom events
		if (customEvent.row_status !== 'upcoming') {
			toast.error("Can only delete upcoming events.");
			return;
		}

		if (!confirm(`Delete this custom event: "${customEvent.name}"?`)) return;

		// Delete associated attendance scans first
		const { error: scansError } = await supabase
			.from('attendance_scans')
			.delete()
			.eq('event_id', customEvent.db_id);

		if (scansError) {
			console.error('Error deleting attendance scans:', scansError);
			// Continue with event deletion anyway
		}

		// Delete the event
		const { error } = await supabase
			.from('events')
			.delete()
			.eq('event_id', customEvent.db_id);

		if (error) {
			toast.error("Failed to delete event");
			console.error(error);
			return;
		}

		toast.success("Event deleted successfully");
		fetchData();
	}

	async function toggleRecurringActive(id: string) {
		const eventType = recurringEventTypes.find(e => e.event_id === id);
		if (!eventType) return;

		const newStatus = !eventType.is_active;
		const { error } = await supabase
			.from('event_types')
			.update({ is_active: newStatus })
			.eq('event_type_id', eventType.db_id);

		if (error) {
			toast.error("Failed to toggle event type");
			return;
		}

		toast.success(`Event type ${newStatus ? 'activated' : 'deactivated'}`);
		fetchData();
	}

	// Add Event Dialog State
	let showAddEventDialog = $state(false);
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

		if (newEvent.type === 'custom' && !newEvent.date) {
			toast.error('Please select a date for the custom event');
			return;
		}

		if (!newEvent.startTime?.trim() || !newEvent.endTime?.trim()) {
			toast.error('Please enter start and end times');
			return;
		}

		const scheduleLabel = newEvent.type === 'recurring' 
			? (newEvent.schedule === 'weekly' ? newEvent.days.join(', ') : `${newEvent.monthlyOrdinal} ${newEvent.monthlyWeekday}`)
			: 'One-time';

		// Use current date for recurring events placeholder
		const baseDate = newEvent.type === 'recurring' ? new Date().toISOString().split('T')[0] : newEvent.date;
		
		const metadata = {
			schedule: scheduleLabel,
			location: newEvent.location.trim(),
			start_time: newEvent.startTime.trim(),
			end_time: newEvent.endTime.trim(),
			ui_schedule_type: newEvent.schedule,
			days: newEvent.days,
			monthlyOrdinal: newEvent.monthlyOrdinal,
			monthlyWeekday: newEvent.monthlyWeekday
		};

        try {
            if (newEvent.type === 'recurring' && newEvent.schedule === 'weekly') {
                // Recurring Weekly - We might hit event_types
                const dayMap: Record<string, number> = {
                    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
                };

                const daysToCreate = newEvent.days.length > 0 ? newEvent.days : [weekdays[new Date().getDay()]];
                
                for (const day of daysToCreate) {
                    const typePayload = {
                        name: newEvent.name.trim(),
                        day_of_week: dayMap[day],
                        start_time: newEvent.startTime.trim(),
                        end_time: newEvent.endTime.trim(),
                        is_active: true,
                        metadata
                    };

                    let error;
                    if (isEditing && editingId?.startsWith('template-')) {
                        ({ error } = await supabase.from('event_types').update(typePayload).eq('event_type_id', editingId.split('-')[1]));
                    } else {
                        ({ error } = await supabase.from('event_types').insert([typePayload]));
                    }
                    
                    if (error) throw error;
                }
                toast.success(isEditing ? "Templates updated" : "Recurring templates added");

            } else {
                // One-time or Monthly (Monthly not fully supported by event_types schema yet, so treat as custom instance for now)
                const payload = {
                    event_name: newEvent.name.trim(),
                    event_date: baseDate,
                    start_datetime: new Date(`${baseDate}T${newEvent.startTime.trim()}`).toISOString(),
                    end_datetime: new Date(`${baseDate}T${newEvent.endTime.trim()}`).toISOString(),
                    status: 'upcoming' as const,
                    is_custom: true,
                    metadata
                };

                let error;
                if (isEditing && editingId?.startsWith('instance-')) {
                    ({ error } = await supabase.from('events').update(payload).eq('event_id', editingId.split('-')[1]));
                } else {
                    ({ error } = await supabase.from('events').insert([payload]));
                }
                
                if (error) throw error;
                toast.success(isEditing ? "Event updated" : "Event added");
            }

            showAddEventDialog = false;
            await fetchData();
            location.reload();

        } catch (err: any) {
            console.error("Save Event Error:", err);
            toast.error(`Error saving event: ${err.message || err.details || 'Unknown error'}`);
        }
	}
</script>

{#if isLoading}
	<FullPageLoading message="Synchronizing organizational events..." />
{:else}
<div class="flex flex-col gap-4 md:gap-6 p-4 md:px-12 md:py-10 lg:px-16 lg:py-12 max-w-7xl mx-auto">

	<!-- Header with Add Button -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h1 class="hidden sm:block text-2xl md:text-3xl font-bold">Events Management</h1>
			<p class="hidden sm:block text-muted-foreground mt-1">Manage recurring and custom events for your organization</p>
		</div>
		<div class="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <Button onclick={addEvent} class="w-full sm:w-auto">
                <Plus class="mr-2 h-4 w-4" />
                Add New Event
            </Button>
        </div>
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
							<div class="flex items-center justify-between">
								<Label class="text-xs font-bold tracking-wider uppercase">Date</Label>
								<button type="button" class="text-xs text-primary font-medium hover:underline cursor-pointer" onclick={() => newEvent.date = new Date().toLocaleDateString('en-CA')}>Today</button>
							</div>
							<Input id="eventDate" type="date" bind:value={newEvent.date} class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
					{/if}

					<!-- Time & Location -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<div class="flex items-center justify-between">
								<Label class="text-xs font-bold tracking-wider uppercase">Start Time</Label>
								<button type="button" class="text-xs text-primary font-medium hover:underline cursor-pointer" onclick={() => { const d = new Date(); newEvent.startTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }}>Now</button>
							</div>
							<Input id="startTime" type="time" bind:value={newEvent.startTime} class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
						<div>
							<div class="flex items-center justify-between">
								<Label class="text-xs font-bold tracking-wider uppercase">End Time</Label>
								<button type="button" class="text-xs text-primary font-medium hover:underline cursor-pointer" onclick={() => { const d = new Date(); d.setHours(d.getHours() + 1); newEvent.endTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }}>+1h</button>
							</div>
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
							<div class="flex items-center justify-between">
								<Label class="text-xs font-bold tracking-wider uppercase">Date</Label>
								<button type="button" class="text-xs text-primary font-medium hover:underline cursor-pointer" onclick={() => newEvent.date = new Date().toLocaleDateString('en-CA')}>Today</button>
							</div>
							<Input id="eventDate" type="date" bind:value={newEvent.date} class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
					{/if}

					<!-- Time & Location -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<div class="flex items-center justify-between">
								<Label class="text-xs font-bold tracking-wider uppercase">Start Time</Label>
								<button type="button" class="text-xs text-primary font-medium hover:underline cursor-pointer" onclick={() => { const d = new Date(); newEvent.startTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }}>Now</button>
							</div>
							<Input id="startTime" type="time" bind:value={newEvent.startTime} class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
						<div>
							<div class="flex items-center justify-between">
								<Label class="text-xs font-bold tracking-wider uppercase">End Time</Label>
								<button type="button" class="text-xs text-primary font-medium hover:underline cursor-pointer" onclick={() => { const d = new Date(); d.setHours(d.getHours() + 1); newEvent.endTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }}>+1h</button>
							</div>
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
				<div class="text-2xl font-bold text-green-500 mb-1">{activeRecurring}</div>
				<div class="text-sm font-medium text-center">Active</div>
			</CardContent>
		</Card>
		<Card>
			<CardContent class="flex flex-col items-center justify-center p-4">
				<Calendar class="h-6 w-6 text-red-500 mb-2" />
				<div class="text-2xl font-bold text-red-500 mb-1">{inactiveRecurring}</div>
				<div class="text-sm font-medium text-center">Inactive</div>
			</CardContent>
		</Card>
	</div>

	<!-- Recurring and Custom Events Side by Side -->
	<div class="grid gap-4 md:gap-6 lg:grid-cols-2">
		<!-- Recurring Events -->
		<div>
			<h2 class="text-xl font-semibold mb-4">Recurring Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each recurringEventTypes as event (event.event_id)}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
								<h3 class="font-medium truncate text-sm sm:text-base">{event.name}</h3>
								<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											<span class="truncate">{event.day_name}</span>
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-3 w-3" />
											{event.start_time_formatted} - {event.end_time_formatted}
										</div>
									</div>
								</div>
								<div class="flex items-center gap-1 ml-2 shrink-0">
									<Switch checked={event.is_active} onCheckedChange={() => toggleActive(event.event_id)} />
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
			<h2 class="text-xl font-semibold mb-4">Custom Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each upcomingCustomEvents as event (event.event_id)}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 mb-2">
										<h3 class="font-medium truncate text-sm sm:text-base">{event.name}</h3>
										<Badge class="shrink-0" variant={new Date(event.event_date) > new Date() ? 'default' : 'secondary'}>
											{new Date(event.event_date) > new Date() ? 'Upcoming' : 'Occurring'}
										</Badge>
									</div>
									<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
										<div class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											<span class="truncate">{event.event_date ? new Date(event.event_date).toLocaleDateString() : 'N/A'}</span>
										</div>
										<div class="flex items-center gap-1">
											<Clock class="h-3 w-3" />
											{event.start_time} - {event.end_time}
										</div>
										{#if event.location}
											<div class="flex items-center gap-1">
												<MapPin class="h-3 w-3" />
												<span class="truncate">{event.location}</span>
											</div>
										{/if}
									</div>
								</div>
								<div class="flex items-center gap-1 ml-2 shrink-0">
								<Switch checked={event.status === 'Active'} disabled={event.row_status === 'ongoing'} onCheckedChange={() => toggleActive(event.event_id)} />
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
				{#if upcomingCustomEvents.length === 0}
					<div class="text-center text-muted-foreground py-8">No upcoming custom events</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Past Events -->
	{#if pastCustomEvents.length > 0}
		<div>
			<h2 class="text-xl font-semibold mb-4 text-muted-foreground">Past Events</h2>
			<div class="space-y-3 sm:space-y-4">
				{#each pastCustomEvents as event (event.event_id)}
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
										{#if event.location}
											<div class="flex items-center gap-1">
												<MapPin class="h-4 w-4" />
												{event.location}
											</div>
										{/if}
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
{/if}
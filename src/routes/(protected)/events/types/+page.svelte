<script lang="ts">
    import { onMount } from 'svelte';
    import { eventTypesApi } from '$lib/api/event_types';
    import type { EventType } from '$lib/types';
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
    import * as Table from "$lib/components/ui/table";
    import * as Sheet from "$lib/components/ui/sheet";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Switch } from "$lib/components/ui/switch";
    import * as Select from "$lib/components/ui/select";
    import { toast } from "svelte-sonner";
    import { Plus, Pencil, Trash2, Calendar, ArrowLeft, Loader2 } from "lucide-svelte";
    import { goto } from '$app/navigation';

    let eventTypes = $state<EventType[]>([]);
    let isLoading = $state(true);
    let isSheetOpen = $state(false);
    let isSaving = $state(false);
    
    // Form State
    let editingId = $state<number | null>(null);
    let formData = $state({
        name: '',
        day_of_week: '0',
        start_time: '09:00',
        end_time: '10:00',
        is_active: true
    });

    const DAYS = [
        { value: '0', label: 'Sunday' },
        { value: '1', label: 'Monday' },
        { value: '2', label: 'Tuesday' },
        { value: '3', label: 'Wednesday' },
        { value: '4', label: 'Thursday' },
        { value: '5', label: 'Friday' },
        { value: '6', label: 'Saturday' },
    ];

    onMount(loadEventTypes);

    async function loadEventTypes() {
        try {
            isLoading = true;
            eventTypes = await eventTypesApi.getAll();
        } catch (error) {
            console.error(error);
            toast.error("Failed to load event templates");
        } finally {
            isLoading = false;
        }
    }

    function openCreateSheet() {
        editingId = null;
        formData = {
            name: '',
            day_of_week: '1', // Default Monday
            start_time: '09:00',
            end_time: '10:00',
            is_active: true
        };
        isSheetOpen = true;
    }

    function openEditSheet(type: EventType) {
        editingId = type.event_type_id;
        formData = {
            name: type.name,
            day_of_week: type.day_of_week.toString(),
            start_time: type.start_time.slice(0, 5), // Remove seconds if present
            end_time: type.end_time.slice(0, 5),
            is_active: type.is_active
        };
        isSheetOpen = true;
    }

    async function handleDelete(id: number) {
        if (!confirm("Are you sure? This won't delete past events, but will stop future generation.")) return;
        try {
            await eventTypesApi.delete(id);
            toast.success("Template deleted");
            await loadEventTypes();
        } catch (e) {
            toast.error("Failed to delete");
        }
    }

    async function handleSubmit() {
        if (!formData.name) {
            toast.error("Name is required");
            return;
        }

        try {
            isSaving = true;
            const payload: any = {
                name: formData.name,
                day_of_week: parseInt(formData.day_of_week),
                start_time: formData.start_time,
                end_time: formData.end_time,
                is_active: formData.is_active
            };

            if (editingId) {
                await eventTypesApi.update(editingId, payload);
                toast.success("Template updated");
            } else {
                await eventTypesApi.create(payload);
                toast.success("Template created");
            }
            
            isSheetOpen = false;
            await loadEventTypes();
        } catch (e) {
            console.error(e);
            toast.error("Failed to save");
        } finally {
            isSaving = false;
        }
    }

    function getDayLabel(dow: number) {
        return DAYS.find(d => d.value === dow.toString())?.label || 'Unknown';
    }
</script>

<div class="flex flex-col gap-6 p-4 md:p-8 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-center gap-2">
            <Button variant="ghost" size="icon" onclick={() => goto('/events')}>
                <ArrowLeft class="w-5 h-5" />
            </Button>
            <div>
                <h1 class="text-3xl font-bold tracking-tight">Recurring Schedules</h1>
                <p class="text-muted-foreground">Manage templates for automatically generated events.</p>
            </div>
        </div>
        <Button onclick={openCreateSheet}>
            <Plus class="w-4 h-4 mr-2" />
            Add Template
        </Button>
    </div>

    <!-- Content -->
    <Card>
        <CardContent class="p-0">
            <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head>Day</Table.Head>
                        <Table.Head>Name</Table.Head>
                        <Table.Head>Time</Table.Head>
                        <Table.Head>Status</Table.Head>
                        <Table.Head class="text-right">Actions</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#if isLoading}
                         <Table.Row>
                            <Table.Cell colspan={5} class="text-center py-8">
                                <Loader2 class="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                            </Table.Cell>
                        </Table.Row>
                    {:else if eventTypes.length === 0}
                        <Table.Row>
                            <Table.Cell colspan={5} class="text-center py-8 text-muted-foreground">
                                No recurring templates found. Create one to get started.
                            </Table.Cell>
                        </Table.Row>
                    {:else}
                        {#each eventTypes as type}
                            <Table.Row>
                                <Table.Cell class="font-medium">{getDayLabel(type.day_of_week)}</Table.Cell>
                                <Table.Cell>{type.name}</Table.Cell>
                                <Table.Cell>{type.start_time.slice(0,5)} - {type.end_time.slice(0,5)}</Table.Cell>
                                <Table.Cell>
                                    {#if type.is_active}
                                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
                                    {:else}
                                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">Inactive</span>
                                    {/if}
                                </Table.Cell>
                                <Table.Cell class="text-right">
                                    <div class="flex justify-end gap-2">
                                        <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => openEditSheet(type)}>
                                            <Pencil class="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:text-destructive" onclick={() => handleDelete(type.event_type_id)}>
                                            <Trash2 class="w-4 h-4" />
                                        </Button>
                                    </div>
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    {/if}
                </Table.Body>
            </Table.Root>
        </CardContent>
    </Card>
</div>

<!-- Sheet for Editing/Creating -->
<Sheet.Root bind:open={isSheetOpen}>
    <Sheet.Content side="right">
        <Sheet.Header>
            <Sheet.Title>{editingId ? 'Edit Template' : 'New Recurring Event'}</Sheet.Title>
            <Sheet.Description>
                Configure the schedule details. Events will be generated based on this pattern.
            </Sheet.Description>
        </Sheet.Header>
        
        <div class="grid gap-6 py-6">
            <div class="grid gap-2">
                <Label for="name">Event Name</Label>
                <Input id="name" bind:value={formData.name} placeholder="e.g. Sunday Service" />
            </div>

            <div class="grid gap-2">
                <Label>Day of Week</Label>
                <Select.Root type="single" bind:value={formData.day_of_week}>
                    <Select.Trigger>
                        {DAYS.find(d => d.value === formData.day_of_week)?.label}
                    </Select.Trigger>
                    <Select.Content>
                        {#each DAYS as day}
                            <Select.Item value={day.value} label={day.label}>{day.label}</Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="grid gap-2">
                    <Label for="start">Start Time</Label>
                    <Input id="start" type="time" bind:value={formData.start_time} />
                </div>
                <div class="grid gap-2">
                    <Label for="end">End Time</Label>
                    <Input id="end" type="time" bind:value={formData.end_time} />
                </div>
            </div>

            <div class="flex items-center justify-between rounded-lg border p-4">
                <div class="space-y-0.5">
                    <Label class="text-base">Active Status</Label>
                    <div class="text-sm text-muted-foreground">
                        Include in generation
                    </div>
                </div>
                <Switch bind:checked={formData.is_active} />
            </div>
        </div>

        <Sheet.Footer>
            <Button variant="outline" onclick={() => isSheetOpen = false}>Cancel</Button>
            <Button onclick={handleSubmit} disabled={isSaving}>
                {#if isSaving}
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                {/if}
                Save Template
            </Button>
        </Sheet.Footer>
    </Sheet.Content>
</Sheet.Root>

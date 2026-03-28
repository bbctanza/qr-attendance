<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import {
		type DateValue,
		DateFormatter,
		getLocalTimeZone,
		parseDate
	} from '@internationalized/date';
	import { cn, getErrorMessage, getErrorTitle } from '$lib/utils';
	import {
		ChevronLeft,
		CalendarClock,
		Trash2,
		RefreshCw,
		Construction,
		Calendar as CalendarIcon,
		Clock,
		Wrench
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { devTools } from '$lib/stores/dev';
	import { supabase } from '$lib/supabase';

	let mockDateStr = $state('');
	let mockTimeStr = $state('');

	// Audit Trail Settings State
	let auditTrailEnabled = $state(false);
	let gdprModeEnabled = $state(false);
	let restrictUndoToAdmin = $state(false);
	let requireUndoApproval = $state(false);
	let auditLogRetentionDays = $state(90);
	let auditBatchingEnabled = $state(true);

	// Date Picker State
	let mockDateValue = $state<DateValue | undefined>();
	const df = new DateFormatter('en-US', {
		dateStyle: 'medium'
	});

	// Sync audit settings from store
	$effect(() => {
		auditTrailEnabled = $devTools.auditTrailEnabled;
		gdprModeEnabled = $devTools.gdprModeEnabled;
		restrictUndoToAdmin = $devTools.restrictUndoToAdmin;
		requireUndoApproval = $devTools.requireUndoApproval;
		auditLogRetentionDays = $devTools.auditLogRetentionDays;
		auditBatchingEnabled = $devTools.auditBatchingEnabled;
	});

	// Sync changes back to store
	$effect(() => {
		devTools.setAuditTrailEnabled(auditTrailEnabled);
	});

	$effect(() => {
		devTools.setGDPRModeEnabled(gdprModeEnabled);
	});

	$effect(() => {
		devTools.setRestrictUndoToAdmin(restrictUndoToAdmin);
	});

	$effect(() => {
		devTools.setRequireUndoApproval(requireUndoApproval);
	});

	$effect(() => {
		devTools.setAuditLogRetentionDays(auditLogRetentionDays);
	});

	$effect(() => {
		devTools.setAuditBatchingEnabled(auditBatchingEnabled);
	});

	// Sync from store
	$effect(() => {
		if ($devTools.isMockTimeActive && $devTools.mockTime) {
			const d = $devTools.mockTime;
			// Format YYYY-MM-DD and HH:MM
			const isoDate = d.toISOString().split('T')[0];
			mockDateStr = isoDate;
			mockTimeStr = d.toTimeString().slice(0, 5);
			try {
				mockDateValue = parseDate(isoDate);
			} catch (e) {}
		}
	});

	async function applyMockTime() {
		if (!mockDateStr || !mockTimeStr) {
			devTools.setMockTime(new Date()); // Reset to current time
			toast.success('Mock time cleared');
			return;
		}

		try {
			const [hours, minutes] = mockTimeStr.split(':').map(Number);
			const combined = new Date(mockDateStr);
			combined.setHours(hours, minutes, 0);
			devTools.setMockTime(combined);
			toast.success(`Mock time set to ${combined.toLocaleString()}`);
		} catch (e) {
			toast.error('Invalid time format');
		}
	}

	async function runDevTool(tool: 'fix_past' | 'process_all' | 'clear_history') {
		if (!confirm('Are you sure? This is a developer action.')) return;

		const toastId = toast.loading('Running tool...');
		try {
			if (tool === 'fix_past') {
				// Calls auto-update status which completes past events
				const { error } = await supabase.rpc('update_event_statuses');
				if (error) throw error;
				toast.success('Past events fixed & completed', { id: toastId });
			} else if (tool === 'process_all') {
				// Force process all completed events (ensure attendance is generated)
				const { error } = await supabase.rpc('force_process_all_events');
				if (error) throw error;
				toast.success('All events processed', { id: toastId });
			} else if (tool === 'clear_history') {
				const { error } = await supabase.rpc('clear_attendance_history');
				if (error) throw error;
				toast.success('Attendance history wiped', { id: toastId });
			}
		} catch (e: any) {
			console.error(e);
			const msg = getErrorMessage(e);
			const title = getErrorTitle(e);
			toast.error(`${title}: ${msg}`, { id: toastId });
		}
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:gap-8 md:px-8 md:py-6 lg:px-12 lg:py-8">
	<!-- Header -->
	<div class="hidden items-center gap-3 sm:flex sm:gap-4">
		<button
			onclick={() => goto('/settings')}
			class="shrink-0 rounded-lg p-2 transition hover:bg-muted"
		>
			<ChevronLeft class="h-5 w-5 sm:h-6 sm:w-6" />
		</button>
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold md:text-3xl">Developer Tools</h1>
			<p class="mt-1 hidden text-sm text-muted-foreground sm:block">Debug and test features</p>
		</div>
	</div>

	<!-- Developer Tools Section -->
	<Card class="lg:col-span-2">
		<CardHeader class="mb-4 border-b border-border/10 pb-3">
			<div class="flex items-center gap-2">
				<Construction class="h-5 w-5 shrink-0 text-primary" />
				<CardTitle class="text-base sm:text-lg">Developer Settings</CardTitle>
			</div>
		</CardHeader>
		<CardContent class="space-y-6">
			<!-- Mock Time -->
			<div class="space-y-3">
				<div class="flex items-center gap-2 text-sm font-bold text-foreground/80">
					<CalendarClock class="h-4 w-4" /> Mock Date & Time
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<div class="flex flex-col space-y-1">
						<Label class="mb-1 text-xs text-muted-foreground">Mock Date</Label>
						<Popover.Root>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button
										variant="outline"
										class={cn(
											'w-full justify-start text-left font-normal',
											!mockDateValue && 'text-muted-foreground'
										)}
										{...props}
									>
										<CalendarIcon class="mr-2 h-4 w-4" />
										{mockDateValue
											? df.format(mockDateValue.toDate(getLocalTimeZone()))
											: 'Pick a date'}
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-auto p-0" align="start">
								<Calendar type="single" bind:value={mockDateValue} initialFocus />
							</Popover.Content>
						</Popover.Root>
					</div>
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">Mock Time</Label>
						<div class="relative">
							<Input type="time" bind:value={mockTimeStr} class="bg-card pl-10" />
							<Clock
								class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
						</div>
					</div>
					<div class="flex items-end gap-2">
						<Button
							size="sm"
							class="flex-1 bg-green-600 text-white hover:bg-green-700"
							onclick={applyMockTime}>Apply</Button
						>
						<Button
							size="sm"
							variant="outline"
							onclick={() => {
								mockDateStr = '';
								mockDateValue = undefined;
								mockTimeStr = '';
								applyMockTime();
							}}>Reset</Button
						>
					</div>
				</div>
				<p class="text-[11px] text-muted-foreground">
					If set, the app will simulate this time for client-side logic (e.g. scanner validation).
					Does not affect server time.
				</p>
			</div>

			<div class="h-px w-full bg-border/10"></div>

			<!-- DB Tools -->
			<div class="space-y-3">
				<div class="flex items-center gap-2 text-sm font-bold text-foreground/80">
					<Wrench class="h-4 w-4" /> Database Testing Tools
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<Button
						variant="default"
						class="flex h-auto flex-col items-start gap-1 border-none bg-orange-600 py-3 text-white hover:bg-orange-700"
						onclick={() => runDevTool('fix_past')}
					>
						<div class="flex items-center gap-2 font-bold">
							<Wrench class="h-4 w-4" /> Fix Past Events
						</div>
						<span class="text-left text-[10px] font-normal opacity-80"
							>Update past events to "completed" and process attendance.</span
						>
					</Button>

					<Button
						variant="default"
						class="flex h-auto flex-col items-start gap-1 border-none bg-blue-600 py-3 text-white hover:bg-blue-700"
						onclick={() => runDevTool('process_all')}
					>
						<div class="flex items-center gap-2 font-bold">
							<RefreshCw class="h-4 w-4" /> Process All Events
						</div>
						<span class="text-left text-[10px] font-normal opacity-80"
							>Force re-process attendance for all completed events.</span
						>
					</Button>

					<Button
						variant="default"
						class="flex h-auto flex-col items-start gap-1 border-none bg-red-600 py-3 text-white hover:bg-red-700"
						onclick={() => runDevTool('clear_history')}
					>
						<div class="flex items-center gap-2 font-bold">
							<Trash2 class="h-4 w-4" /> Clear History
						</div>
						<span class="text-left text-[10px] font-normal opacity-80"
							>Permanently delete all attendance history.</span
						>
					</Button>
				</div>
			</div>

			<div class="h-px w-full bg-border/10"></div>

			<!-- Audit Trail Settings -->
			<div class="space-y-4">
				<div class="text-sm font-bold text-foreground/80">🔐 Audit Trail Settings</div>

				<div class="space-y-4 rounded-lg bg-muted/30 p-4">
					<!-- Audit Trail Enabled -->
					<div class="flex items-center justify-between">
						<div class="min-w-0 flex-1">
							<Label class="text-sm font-medium">🔲 Audit Trail Enabled</Label>
							<p class="mt-1 text-xs text-muted-foreground">Turn logging on/off for all changes</p>
						</div>
						<Switch bind:checked={auditTrailEnabled} class="ml-4 shrink-0" />
					</div>

					<!-- GDPR Mode -->
					<div class="flex items-center justify-between">
						<div class="min-w-0 flex-1">
							<Label class="text-sm font-medium">🔲 GDPR Mode</Label>
							<p class="mt-1 text-xs text-muted-foreground">
								Enable anonymization and soft-delete grace periods
							</p>
						</div>
						<Switch bind:checked={gdprModeEnabled} class="ml-4 shrink-0" />
					</div>

					<!-- Restrict Undo to Admin -->
					<div class="flex items-center justify-between">
						<div class="min-w-0 flex-1">
							<Label class="text-sm font-medium">🔲 Restrict Undo to Admin</Label>
							<p class="mt-1 text-xs text-muted-foreground">Lock undo permissions to admins only</p>
						</div>
						<Switch bind:checked={restrictUndoToAdmin} class="ml-4 shrink-0" />
					</div>

					<!-- Require Undo Approval -->
					<div class="flex items-center justify-between">
						<div class="min-w-0 flex-1">
							<Label class="text-sm font-medium">🔲 Require Undo Approval</Label>
							<p class="mt-1 text-xs text-muted-foreground">
								Add approval step for restore actions
							</p>
						</div>
						<Switch bind:checked={requireUndoApproval} class="ml-4 shrink-0" />
					</div>

					<!-- Log Retention Days -->
					<div class="space-y-2">
						<Label class="text-sm font-medium">📊 Log Retention Days</Label>
						<div class="flex items-center gap-3">
							<Input
								type="number"
								min="1"
								max="365"
								bind:value={auditLogRetentionDays}
								class="max-w-20"
							/>
							<span class="text-xs text-muted-foreground">days to keep audit logs (default 90)</span
							>
						</div>
					</div>

					<!-- Enable Batching -->
					<div class="flex items-center justify-between">
						<div class="min-w-0 flex-1">
							<Label class="text-sm font-medium">⚙️ Enable Batching</Label>
							<p class="mt-1 text-xs text-muted-foreground">
								Use smart queuing for ~90% write reduction
							</p>
						</div>
						<Switch bind:checked={auditBatchingEnabled} class="ml-4 shrink-0" />
					</div>
				</div>
			</div>
		</CardContent>
	</Card>
</div>

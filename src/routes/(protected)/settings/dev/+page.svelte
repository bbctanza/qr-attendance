<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { getErrorMessage, getErrorTitle } from '$lib/utils';
	import {
		ChevronLeft,
		Construction,
		Database,
		Wrench,
		RefreshCw,
		Trash2,
		ShieldCheck,
		ShieldAlert,
		FileText,
		Lock,
		CheckSquare,
		Zap,
		Clock,
		RotateCcw,
		Eye,
		EyeOff
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { devTools } from '$lib/stores/dev';
	import { supabase } from '$lib/supabase';

	// Audit Trail Settings State
	let auditTrailEnabled = $state(false);
	let gdprModeEnabled = $state(false);
	let restrictUndoToAdmin = $state(false);
	let requireUndoApproval = $state(false);
	let auditLogRetentionDays = $state(90);
	let auditBatchingEnabled = $state(true);
	let bypassEventTimeValidation = $state(false);

	// Wipe Security Dialog State
	let showWipeDialog = $state(false);
	let wipeConfirmationText = $state('');
	let accountPassword = $state('');
	let showPassword = $state(false);
	let isWiping = $state(false);

	// Derived validation for wipe button
	let isWipeConfirmed = $derived(
		wipeConfirmationText.trim().toUpperCase() === 'WIPE' &&
			accountPassword.trim().length > 0
	);

	let isInitialized = $state(false);

	onMount(() => {
		devTools.init();
		auditTrailEnabled = $devTools.auditTrailEnabled;
		gdprModeEnabled = $devTools.gdprModeEnabled;
		restrictUndoToAdmin = $devTools.restrictUndoToAdmin;
		requireUndoApproval = $devTools.requireUndoApproval;
		auditLogRetentionDays = $devTools.auditLogRetentionDays;
		auditBatchingEnabled = $devTools.auditBatchingEnabled;
		bypassEventTimeValidation = $devTools.bypassEventTimeValidation;
		isInitialized = true;
	});

	// Sync changes back to store when modified after init
	$effect(() => {
		if (isInitialized) {
			devTools.setAuditTrailEnabled(auditTrailEnabled);
		}
	});

	$effect(() => {
		if (isInitialized) {
			devTools.setGDPRModeEnabled(gdprModeEnabled);
		}
	});

	$effect(() => {
		if (isInitialized) {
			devTools.setRestrictUndoToAdmin(restrictUndoToAdmin);
		}
	});

	$effect(() => {
		if (isInitialized) {
			devTools.setRequireUndoApproval(requireUndoApproval);
		}
	});

	$effect(() => {
		if (isInitialized) {
			devTools.setAuditLogRetentionDays(auditLogRetentionDays);
		}
	});

	$effect(() => {
		if (isInitialized) {
			devTools.setAuditBatchingEnabled(auditBatchingEnabled);
		}
	});

	$effect(() => {
		if (isInitialized) {
			devTools.setBypassEventTimeValidation(bypassEventTimeValidation);
		}
	});

	function handleResetDefaults() {
		if (confirm('Reset all developer settings and audit configuration to system defaults?')) {
			devTools.resetAuditSettings();
			auditTrailEnabled = $devTools.auditTrailEnabled;
			gdprModeEnabled = $devTools.gdprModeEnabled;
			restrictUndoToAdmin = $devTools.restrictUndoToAdmin;
			requireUndoApproval = $devTools.requireUndoApproval;
			auditLogRetentionDays = $devTools.auditLogRetentionDays;
			auditBatchingEnabled = $devTools.auditBatchingEnabled;
			bypassEventTimeValidation = $devTools.bypassEventTimeValidation;
			toast.success('Developer settings reset to defaults');
		}
	}

	function handleOpenWipeDialog() {
		wipeConfirmationText = '';
		accountPassword = '';
		showPassword = false;
		showWipeDialog = true;
	}

	async function executeWipe() {
		if (!isWipeConfirmed) {
			toast.error('Please type WIPE and enter your account password.');
			return;
		}

		isWiping = true;
		const toastId = toast.loading('Verifying identity & executing data wipe...');

		try {
			// 1. Verify live account user session & re-authenticate with provided password
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (!user || !user.email) {
				throw new Error('Not authenticated or user session missing');
			}

			const { error: authError } = await supabase.auth.signInWithPassword({
				email: user.email,
				password: accountPassword
			});

			if (authError) {
				toast.error('Security Verification Failed: Incorrect password.', { id: toastId });
				isWiping = false;
				return;
			}

			// 2. Call RPC passing mandatory security passcode
			const { error: rpcError } = await supabase.rpc('clear_attendance_history', {
				passcode: 'WIPE_ATTENDANCE_HISTORY_CONFIRMED'
			});

			if (rpcError) throw rpcError;

			toast.success('Attendance history successfully wiped.', { id: toastId });
			showWipeDialog = false;
			wipeConfirmationText = '';
			accountPassword = '';
			showPassword = false;
		} catch (e: any) {
			console.error(e);
			const msg = getErrorMessage(e);
			const title = getErrorTitle(e);
			toast.error(`${title}: ${msg}`, { id: toastId });
		} finally {
			isWiping = false;
		}
	}

	async function runDevTool(tool: 'fix_past' | 'process_all') {
		if (!confirm('Are you sure? This is a developer action.')) return;

		const toastId = toast.loading('Running tool...');
		try {
			if (tool === 'fix_past') {
				const { error } = await supabase.rpc('update_event_statuses');
				if (error) throw error;
				toast.success('Past events fixed & completed', { id: toastId });
			} else if (tool === 'process_all') {
				const { error } = await supabase.rpc('force_process_all_events');
				if (error) throw error;
				toast.success('All events processed', { id: toastId });
			}
		} catch (e: any) {
			console.error(e);
			const msg = getErrorMessage(e);
			const title = getErrorTitle(e);
			toast.error(`${title}: ${msg}`, { id: toastId });
		}
	}
</script>

<div class="flex w-full flex-col gap-6 p-4 md:p-6 lg:p-8">
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
			<p class="mt-1 hidden text-sm text-muted-foreground sm:block">
				Debug controls, database testing routines, and audit trail configurations
			</p>
		</div>
	</div>

	<!-- Main Settings Grid -->
	<div class="grid auto-rows-max grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Testing & Validation Controls -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Construction class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Testing & Validation</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="flex items-start justify-between gap-4 rounded-lg border p-4 transition-colors">
					<div class="space-y-1">
						<div class="flex items-center gap-2">
							<Label class="text-sm font-semibold">Bypass Event Time Validation</Label>
							{#if bypassEventTimeValidation}
								<span
									class="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
								>
									Active
								</span>
							{/if}
						</div>
						<p class="text-xs leading-relaxed text-muted-foreground">
							Allows scanning into ANY event regardless of its start or end time. Recommended for local testing without altering real dates.
						</p>
					</div>
					<Switch bind:checked={bypassEventTimeValidation} class="mt-1 shrink-0" />
				</div>
			</CardContent>
		</Card>

		<!-- Database Testing Tools -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Database class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Database Maintenance</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3">
				<!-- Fix Past Events -->
				<div
					class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400"
						>
							<Wrench class="h-4 w-4" />
						</div>
						<div>
							<h4 class="text-sm font-medium">Fix Past Events</h4>
							<p class="text-xs text-muted-foreground">Mark past events as completed & process attendance.</p>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						class="w-full shrink-0 sm:w-auto"
						onclick={() => runDevTool('fix_past')}
					>
						Execute
					</Button>
				</div>

				<!-- Process All Events -->
				<div
					class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400"
						>
							<RefreshCw class="h-4 w-4" />
						</div>
						<div>
							<h4 class="text-sm font-medium">Process All Events</h4>
							<p class="text-xs text-muted-foreground">Force re-process attendance for all completed events.</p>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						class="w-full shrink-0 sm:w-auto"
						onclick={() => runDevTool('process_all')}
					>
						Process
					</Button>
				</div>

				<!-- Clear History -->
				<div
					class="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-600 dark:text-red-400"
						>
							<Trash2 class="h-4 w-4" />
						</div>
						<div>
							<h4 class="text-sm font-medium text-red-600 dark:text-red-400">Clear Attendance History</h4>
							<p class="text-xs text-muted-foreground">Permanently delete all attendance history logs.</p>
						</div>
					</div>
					<Button
						variant="destructive"
						size="sm"
						class="w-full shrink-0 sm:w-auto"
						onclick={handleOpenWipeDialog}
					>
						Clear
					</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Audit Trail Configuration -->
		<Card class="lg:col-span-2">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<ShieldCheck class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Audit Trail & Compliance Configuration</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<!-- Audit Trail Enabled -->
					<div class="flex items-start justify-between gap-3 rounded-lg border p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
							>
								<FileText class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<Label class="text-sm font-medium">Audit Trail Enabled</Label>
								<p class="mt-0.5 text-xs text-muted-foreground">Log system operations and security events</p>
							</div>
						</div>
						<Switch bind:checked={auditTrailEnabled} class="shrink-0" />
					</div>

					<!-- GDPR Mode -->
					<div class="flex items-start justify-between gap-3 rounded-lg border p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
							>
								<ShieldAlert class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<Label class="text-sm font-medium">GDPR Mode</Label>
								<p class="mt-0.5 text-xs text-muted-foreground">Anonymization and soft-delete grace periods</p>
							</div>
						</div>
						<Switch bind:checked={gdprModeEnabled} class="shrink-0" />
					</div>

					<!-- Restrict Undo to Admin -->
					<div class="flex items-start justify-between gap-3 rounded-lg border p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
							>
								<Lock class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<Label class="text-sm font-medium">Restrict Undo to Admin</Label>
								<p class="mt-0.5 text-xs text-muted-foreground">Lock undo/restore permissions strictly to admins</p>
							</div>
						</div>
						<Switch bind:checked={restrictUndoToAdmin} class="shrink-0" />
					</div>

					<!-- Require Undo Approval -->
					<div class="flex items-start justify-between gap-3 rounded-lg border p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
							>
								<CheckSquare class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<Label class="text-sm font-medium">Require Undo Approval</Label>
								<p class="mt-0.5 text-xs text-muted-foreground">Enforce approval workflow before restores</p>
							</div>
						</div>
						<Switch bind:checked={requireUndoApproval} class="shrink-0" />
					</div>

					<!-- Enable Batching -->
					<div class="flex items-start justify-between gap-3 rounded-lg border p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
							>
								<Zap class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<Label class="text-sm font-medium">Smart Queue Batching</Label>
								<p class="mt-0.5 text-xs text-muted-foreground">Optimize audit writes with queued batching (~90% reduction)</p>
							</div>
						</div>
						<Switch bind:checked={auditBatchingEnabled} class="shrink-0" />
					</div>

					<!-- Log Retention Days -->
					<div class="flex items-start justify-between gap-3 rounded-lg border p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
							>
								<Clock class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<Label class="text-sm font-medium">Log Retention Period</Label>
								<p class="mt-0.5 text-xs text-muted-foreground">Days to retain audit history (default 90)</p>
							</div>
						</div>
						<Input
							type="number"
							min="1"
							max="365"
							bind:value={auditLogRetentionDays}
							class="w-20 shrink-0 text-right"
						/>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Reset Defaults Footer Card -->
		<Card class="border-dashed lg:col-span-2">
			<CardContent class="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row">
				<div class="flex items-center gap-3">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
						<RotateCcw class="h-4 w-4 text-muted-foreground" />
					</div>
					<div>
						<p class="text-sm font-medium">Reset Developer Settings</p>
						<p class="text-xs text-muted-foreground">Restore developer tools and audit flags back to defaults.</p>
					</div>
				</div>
				<Button variant="outline" size="sm" class="w-full sm:w-auto" onclick={handleResetDefaults}>
					Reset to Defaults
				</Button>
			</CardContent>
		</Card>
	</div>
</div>

<!-- Security Lock Wipe Dialog Modal -->
<AlertDialog.Root bind:open={showWipeDialog}>
	<AlertDialog.Content class="max-w-md p-6">
		<AlertDialog.Header class="space-y-2">
			<div class="flex items-center gap-2 text-red-600 dark:text-red-400">
				<ShieldAlert class="h-5 w-5 shrink-0" />
				<AlertDialog.Title class="text-lg font-bold">Clear Attendance History</AlertDialog.Title>
			</div>
			<AlertDialog.Description class="text-xs leading-relaxed text-muted-foreground">
				This action is <strong class="font-semibold text-foreground">destructive and permanent</strong>. All attendance records will be purged.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="space-y-4 py-2">
			<!-- Step 1: Confirmation Text -->
			<div class="space-y-1.5">
				<Label class="text-xs font-medium text-foreground">
					Step 1: Type <span class="font-bold text-red-600 dark:text-red-400">WIPE</span> to confirm
				</Label>
				<Input
					type="text"
					placeholder="Type WIPE to confirm"
					bind:value={wipeConfirmationText}
					class="text-xs"
				/>
			</div>

			<!-- Step 2: Account Password Verification -->
			<div class="space-y-1.5">
				<Label for="accountPassword" class="text-xs font-medium text-foreground">
					Step 2: Enter password to re-authenticate
				</Label>
				<div class="relative">
					<Input
						id="accountPassword"
						type={showPassword ? 'text' : 'password'}
						placeholder="Enter your password"
						bind:value={accountPassword}
						class="pr-10 text-xs"
					/>
					<button
						type="button"
						class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground focus:outline-none"
						onclick={() => (showPassword = !showPassword)}
						title={showPassword ? 'Hide password' : 'Show password'}
					>
						{#if showPassword}
							<EyeOff class="h-3.5 w-3.5" />
						{:else}
							<Eye class="h-3.5 w-3.5" />
						{/if}
					</button>
				</div>
			</div>
		</div>

		<AlertDialog.Footer class="mt-4 gap-2 sm:gap-2">
			<AlertDialog.Cancel
				class="h-9 px-3 text-xs"
				onclick={() => (showWipeDialog = false)}
				disabled={isWiping}
			>
				Cancel
			</AlertDialog.Cancel>
			<Button
				variant="destructive"
				size="sm"
				class="h-9 px-3 text-xs"
				onclick={executeWipe}
				disabled={isWiping || !isWipeConfirmed}
			>
				{#if isWiping}
					Wiping Data...
				{:else}
					Confirm & Wipe
				{/if}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

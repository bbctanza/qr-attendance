<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Root as SelectRoot,
		Content as SelectContent,
		Item as SelectItem,
		Trigger as SelectTrigger
	} from '$lib/components/ui/select';
	
	// Create Select namespace for convenience
	const Select = { 
		Root: SelectRoot,
		Content: SelectContent,
		Item: SelectItem,
		Trigger: SelectTrigger
	};
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Pagination } from '$lib/components/ui/pagination';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import {
		AlertCircle,
		ArrowLeft,
		ChevronDown,
		Download,
		RefreshCw,
		Search,
		Undo2,
		Eye,
		X
	} from 'lucide-svelte';
	import { getAllAuditLogs, getAuditHistory, logAuditChange } from '$lib/utils/auditLogger';
	import type { AuditLogRecord } from '$lib/utils/auditLogger';
	import { devTools } from '$lib/stores/dev';
	import { supabase } from '$lib/supabase';
	import { toast } from 'svelte-sonner';

	// State
	let auditLogs = $state<AuditLogRecord[]>([]);
	let filteredLogs = $state<AuditLogRecord[]>([]);
	let isLoading = $state(true);
	let selectedLog = $state<AuditLogRecord | null>(null);
	let showDetailView = $state(false);

	// Pagination
	let currentPage = $state(1);
	const itemsPerPage = 5;

	// Filters
	let filterEntity = $state('all');
	let filterAction = $state('all');
	let filterUser = $state('');
	let searchText = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');

	// Dev menu access
	let canUndo = $state(true);
	let requireUndoApproval = $state(false);
	let restrictUndoToAdmin = $state(false);
	let auditEnabled = $state(true);
	let gdprMode = $state(false);

	// Restore confirmation dialog
	let showRestoreDialog = $state(false);
	let restoreLog = $state<AuditLogRecord | null>(null);

	onMount(async () => {
		// Subscribe to dev settings
		devTools.subscribe((state) => {
			auditEnabled = state.auditTrailEnabled;
			gdprMode = state.gdprModeEnabled;
			restrictUndoToAdmin = state.restrictUndoToAdmin;
			requireUndoApproval = state.requireUndoApproval;
			canUndo = !state.restrictUndoToAdmin && !state.requireUndoApproval;
		});

		// Load audit logs
		await loadLogs();
	});

	// Reactive filters - reset to page 1 when filters change
	$effect(() => {
		if (filterEntity || filterAction || filterUser || searchText || dateFrom || dateTo) {
			currentPage = 1; // Reset to first page when filters change
			applyFilters();
		}
	});

	// Derived paginated logs
	const paginatedLogs = $derived.by(() => {
		const start = (currentPage - 1) * itemsPerPage;
		const end = start + itemsPerPage;
		return filteredLogs.slice(start, end);
	});

	// Derived ghost rows to maintain table size
	const ghostRows = $derived.by(() => {
		const count = itemsPerPage - paginatedLogs.length;
		return Array(Math.max(0, count)).fill(null).map((_, i) => ({ ghostId: i }));
	});

	async function loadLogs() {
		isLoading = true;
		try {
			const result = await getAllAuditLogs({}, 200);
			if (result.success && result.data) {
				auditLogs = result.data;
				applyFilters();
			}
		} catch (error) {
			console.error('Error loading audit logs:', error);
		} finally {
			isLoading = false;
		}
	}

	function applyFilters() {
		filteredLogs = auditLogs.filter((log) => {
			// Entity type filter
			if (filterEntity !== 'all' && log.entity_type !== filterEntity) return false;

			// Action filter
			if (filterAction !== 'all' && log.action !== filterAction) return false;

			// User filter
			if (filterUser && !log.user_email.includes(filterUser)) return false;

			// Search in various fields
			if (searchText) {
				const searchLower = searchText.toLowerCase();
				const matchSearch =
					log.entity_id.toLowerCase().includes(searchLower) ||
					log.user_email.toLowerCase().includes(searchLower) ||
					log.reason?.toLowerCase().includes(searchLower) ||
					log.tags?.some((t) => t.toLowerCase().includes(searchLower));

				if (!matchSearch) return false;
			}

			// Date range filter
			if (dateFrom) {
				const logDate = new Date(log.created_at);
				const fromDate = new Date(dateFrom);
				if (logDate < fromDate) return false;
			}

			if (dateTo) {
				const logDate = new Date(log.created_at);
				const toDate = new Date(dateTo);
				// Add 1 day to include entries on the end date
				toDate.setDate(toDate.getDate() + 1);
				if (logDate > toDate) return false;
			}

			return true;
		});
	}

	function getActionColor(action: string): string {
		switch (action) {
			case 'create':
				return 'bg-green-100 text-green-800';
			case 'update':
				return 'bg-blue-100 text-blue-800';
			case 'delete':
				return 'bg-red-100 text-red-800';
			case 'restore':
				return 'bg-purple-100 text-purple-800';
			case 'import':
				return 'bg-yellow-100 text-yellow-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
	}

	function openRestoreDialog(log: AuditLogRecord) {
		if (!log.change_diff && log.action !== 'delete') {
			alert('Cannot restore this entry - no changes recorded');
			return;
		}
		restoreLog = log;
		showRestoreDialog = true;
	}

	async function confirmRestore() {
		if (!restoreLog) return;
		const log = restoreLog;
		const toastId = toast.loading(`Restoring ${log.entity_type}...`);

		try {
			// Get the current session for audit logging
			const { data: { session } } = await supabase.auth.getSession();

			let restored = false;

			// Handle member restore
			if (log.entity_type === 'member') {
				if (log.action === 'delete') {
					// For DELETE, the change_diff contains the full member data in "before"
					if (log.change_diff) {
						const reconstructed: Record<string, unknown> = { member_id: log.entity_id };
						for (const [field, change] of Object.entries(log.change_diff)) {
							reconstructed[field] = (change as Record<string, unknown>).before;
						}
						const { error } = await supabase
							.from('members')
							.upsert(reconstructed);
						if (error) throw error;
						restored = true;
					} else {
						// Fallback: try to find previous UPDATE/CREATE logs if available
						const { data: prevLogs } = await supabase
							.from('audit_logs')
							.select('*')
							.eq('entity_type', log.entity_type)
							.eq('entity_id', log.entity_id)
							.lt('created_at', log.created_at)
							.order('created_at', { ascending: false })
							.limit(50);

						if (prevLogs && prevLogs.length > 0) {
							let sourceLog = prevLogs.find(l => l.change_diff && (l.action === 'update' || l.action === 'create'));
							
							if (sourceLog && sourceLog.change_diff) {
								const reconstructed: Record<string, unknown> = { member_id: log.entity_id };
								for (const [field, change] of Object.entries(sourceLog.change_diff)) {
									reconstructed[field] = (change as Record<string, unknown>).after;
								}
								const { error } = await supabase
									.from('members')
									.upsert(reconstructed);
								if (error) throw error;
								restored = true;
							}
						}
					}

					if (!restored) {
						throw new Error(`Cannot restore deleted member - deletion was not captured with member data. Restore may not be possible.`);
					}
				} else if (log.action === 'update' && log.change_diff) {
					// Restore to previous values using the change_diff
					const memberUpdate: Record<string, unknown> = {};
					for (const [key, value] of Object.entries(log.change_diff)) {
						memberUpdate[key] = (value as Record<string, unknown>).before;
					}
					memberUpdate['member_id'] = log.entity_id;

					const { error } = await supabase
						.from('members')
						.update(memberUpdate)
						.eq('member_id', log.entity_id);
					if (error) throw error;
					restored = true;
				}
			}
			// Handle event restore
			else if (log.entity_type === 'event') {
				const eventId = parseInt(log.entity_id);
				if (log.action === 'delete') {
					// For DELETE, the change_diff contains the full event data in "before"
					if (log.change_diff) {
						const reconstructed: Record<string, unknown> = { event_id: eventId };
						for (const [field, change] of Object.entries(log.change_diff)) {
							reconstructed[field] = (change as Record<string, unknown>).before;
						}
						const { error } = await supabase
							.from('events')
							.upsert(reconstructed);
						if (error) throw error;
						restored = true;
					} else {
						// Fallback: try to find previous UPDATE/CREATE logs if available
						const { data: prevLogs } = await supabase
							.from('audit_logs')
							.select('*')
							.eq('entity_type', log.entity_type)
							.eq('entity_id', log.entity_id)
							.lt('created_at', log.created_at)
							.order('created_at', { ascending: false })
						.limit(50);

						if (prevLogs && prevLogs.length > 0) {
							let sourceLog = prevLogs.find(l => l.change_diff && (l.action === 'update' || l.action === 'create'));
							
							if (sourceLog && sourceLog.change_diff) {
								const reconstructed: Record<string, unknown> = { event_id: eventId };
								for (const [field, change] of Object.entries(sourceLog.change_diff)) {
									reconstructed[field] = (change as Record<string, unknown>).after;
								}
								const { error } = await supabase
									.from('events')
									.upsert(reconstructed);
								if (error) throw error;
								restored = true;
							}
						}
					}

					if (!restored) {
						throw new Error(`Cannot restore deleted event - deletion was not captured with event data. Restore may not be possible.`);
					}
				} else if (log.action === 'update' && log.change_diff) {
					// Restore to previous values using the change_diff
					const eventUpdate: Record<string, unknown> = {};
					for (const [key, value] of Object.entries(log.change_diff)) {
						eventUpdate[key] = (value as Record<string, unknown>).before;
					}

					const { error } = await supabase
						.from('events')
						.update(eventUpdate)
						.eq('event_id', eventId);
					if (error) throw error;
					restored = true;
				}
			}

			if (!restored) {
				throw new Error(`Cannot restore this action type (${log.action}). Only "update" and "delete" actions are restorable.`);
			}

			// Log the restore action itself
			await logAuditChange(
				{
					entityType: log.entity_type,
					entityId: log.entity_id,
					action: 'restore',
					reason: `Restored from previous ${log.action} action`,
					tags: ['restore', `undo-${log.action}`]
				},
				session
			);

			// Reload logs after restore
			await loadLogs();
			showRestoreDialog = false;
			restoreLog = null;

			toast.success(`${log.entity_type} restored successfully`, { id: toastId });
		} catch (error) {
			console.error('Restore error:', error);
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			toast.error(`Failed to restore: ${errorMsg}`, { id: toastId });
		}
	}

	function cancelRestore() {
		showRestoreDialog = false;
		restoreLog = null;
	}

	function toggleDetailView(log: AuditLogRecord) {
		selectedLog = log;
		showDetailView = true;
	}

	async function exportLogs() {
		const csv = [
			['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'User', 'Reason', 'Tags'].join(','),
			...filteredLogs.map((log) =>
				[
					log.created_at,
					log.entity_type,
					log.entity_id,
					log.action,
					log.user_email,
					log.reason || '-',
					(log.tags || []).join(';')
				]
					.map((v) => `"${v}"`)
					.join(',')
			)
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
	}
</script>

<div class="space-y-6 p-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Audit Logs</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Track all system changes, who made them, and when
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button onclick={loadLogs} variant="outline" class="flex-1 sm:flex-none">
				<RefreshCw class="mr-2 h-4 w-4" />
				Refresh
			</Button>
			<Button onclick={exportLogs} variant="outline" class="flex-1 sm:flex-none">
				<Download class="mr-2 h-4 w-4" />
				Export CSV
			</Button>
		</div>
	</div>

	<!-- Status Cards -->
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-sm font-medium">Total Entries</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">{auditLogs.length}</div>
				<p class="text-xs text-muted-foreground mt-1">All time</p>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-sm font-medium">Audit Status</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">
					{auditEnabled ? '✓ Enabled' : '⊘ Disabled'}
				</div>
				<p class="text-xs text-muted-foreground mt-1">
					{auditEnabled
						? 'Logging active'
						: 'Audit trail disabled (dev mode)'}
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-sm font-medium">GDPR Mode</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">
					{gdprMode ? '✓ On' : '○ Off'}
				</div>
				<p class="text-xs text-muted-foreground mt-1">
					{gdprMode ? 'Anonymization active' : 'Standard logging'}
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-sm font-medium">Undo Access</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">
					{canUndo ? '✓ Allowed' : '🔒 Admin Only'}
				</div>
				<p class="text-xs text-muted-foreground mt-1">
					{canUndo ? 'Staff can undo' : 'Restricted to admin'}
				</p>
			</CardContent>
		</Card>
	</div>


	<!-- Audit Log Table -->
	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<RefreshCw class="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
				<p class="text-sm text-muted-foreground">Loading audit logs...</p>
			</div>
		</div>
	{:else if filteredLogs.length === 0}
		<Card>
			<CardContent class="py-12 text-center">
				<AlertCircle class="h-8 w-8 mx-auto text-muted-foreground mb-2" />
				<p class="text-sm text-muted-foreground">No audit logs found</p>
			</CardContent>
		</Card>
	{:else}
		<Card>
			<!-- Filters Inside Table Card -->
			<CardHeader >
				<CardTitle class="text-m">Logs History</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
					<div>
						<label for="search" class="text-sm font-medium">Search</label>
						<Input
							id="search"
							placeholder="Search..."
							bind:value={searchText}
							class="mt-1"
						/>
					</div>

					<div>
						<label for="entity-type" class="text-sm font-medium">Entity Type</label>
					<Select.Root type="single" bind:value={filterEntity}>
						<Select.Trigger id="entity-type" class="mt-1" />
						<Select.Content>
							<Select.Item value="all">All Types</Select.Item>
							<Select.Item value="member">Member</Select.Item>
							<Select.Item value="event">Event</Select.Item>
							<Select.Item value="user">User</Select.Item>
							<Select.Item value="settings">Settings</Select.Item>
							<Select.Item value="attendance">Attendance</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

				<div>
					<label for="action" class="text-sm font-medium">Action</label>
					<Select.Root type="single" bind:value={filterAction}>
						<Select.Trigger id="action" class="mt-1" />
						<Select.Content>
							<Select.Item value="all">All Actions</Select.Item>
							<Select.Item value="create">Create</Select.Item>
							<Select.Item value="update">Update</Select.Item>
							<Select.Item value="delete">Delete</Select.Item>
							<Select.Item value="restore">Restore</Select.Item>
							<Select.Item value="import">Import</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

					<div>
						<label for="date-from" class="text-sm font-medium">From Date</label>
						<Input
							id="date-from"
							type="date"
							bind:value={dateFrom}
							onchange={applyFilters}
							class="mt-1"
						/>
					</div>

					<div>
						<label for="date-to" class="text-sm font-medium">To Date</label>
						<Input
							id="date-to"
							type="date"
							bind:value={dateTo}
							onchange={applyFilters}
							class="mt-1"
						/>
					</div>
				</div>
			</CardContent>

			<!-- Table -->
			<div class="border-t overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Timestamp</TableHead>
							<TableHead>Entity</TableHead>
							<TableHead>Action</TableHead>
							<TableHead>User</TableHead>
							<TableHead>Details</TableHead>
							<TableHead class="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each paginatedLogs as log (log.id)}
							<TableRow>
								<TableCell class="font-mono text-xs">
									{formatDate(log.created_at)}
								</TableCell>
								<TableCell>
									<Badge variant="outline">{log.entity_type}</Badge>
									<div class="text-xs text-muted-foreground mt-1">{log.entity_id}</div>
								</TableCell>
								<TableCell>
									<Badge class={getActionColor(log.action)}>
										{log.action}
									</Badge>
								</TableCell>
								<TableCell class="text-sm">
									{log.user_email}
									<div class="text-xs text-muted-foreground">{log.user_role}</div>
								</TableCell>
								<TableCell class="text-sm max-w-xs truncate">
									{#if log.reason}
										{log.reason}
									{:else if log.tags?.length}
										{log.tags.join(', ')}
									{:else}
										—
									{/if}
								</TableCell>
								<TableCell class="text-right space-x-2 flex justify-end">
									<Button
										variant="ghost"
										size="sm"
										onclick={() => toggleDetailView(log)}
									>
										<Eye class="h-4 w-4" />
									</Button>
									{#if log.action !== 'restore'}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => openRestoreDialog(log)}
											title={canUndo ? 'Undo this change' : restrictUndoToAdmin ? 'Undo restricted to admin only' : requireUndoApproval ? 'Undo approval required' : 'Cannot undo'}
											disabled={!canUndo}
										>
											<Undo2 class={`h-4 w-4 ${!canUndo ? 'opacity-50' : ''}`} />
										</Button>
									{/if}
								</TableCell>
							</TableRow>
						{/each}
						
						<!-- Ghost Rows for consistent table size -->
						{#each ghostRows as ghost (ghost.ghostId)}
							<TableRow class="opacity-0 pointer-events-none">
								<TableCell>&nbsp;</TableCell>
								<TableCell>&nbsp;</TableCell>
								<TableCell>&nbsp;</TableCell>
								<TableCell>&nbsp;</TableCell>
								<TableCell>&nbsp;</TableCell>
								<TableCell>&nbsp;</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</Card>

		<!-- Pagination -->
		<Pagination 
			currentPage={currentPage}
			totalItems={filteredLogs.length}
			itemsPerPage={itemsPerPage}
			onPageChange={(page) => currentPage = page}
		/>

		<!-- Detail View Modal -->
		<Dialog.Root bind:open={showDetailView}>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm pointer-events-none" />
				<Dialog.Content class="fixed left-[50%] top-[50%] z-50 grid w-[95vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-4 sm:p-6 shadow-lg duration-200 rounded-xl max-h-[90vh] overflow-y-auto pointer-events-auto">
					<div class="relative">
						<Dialog.Close class="absolute right-0 top-0 opacity-70 hover:opacity-100 transition-opacity p-1">
							<X class="h-5 w-5 text-muted-foreground" />
						</Dialog.Close>
						<Dialog.Header>
							<Dialog.Title class="text-lg font-semibold mr-8">
								Change Details
							</Dialog.Title>
							<Dialog.Description class="text-sm text-muted-foreground mt-1">
								{selectedLog?.entity_type} #{selectedLog?.entity_id} - {selectedLog?.action}
							</Dialog.Description>
						</Dialog.Header>
					</div>
					
					{#if selectedLog}
						<div class="space-y-4">
							{#if selectedLog.change_diff}
								<div class="space-y-3 font-mono text-xs sm:text-sm bg-slate-50 p-4 rounded-md overflow-x-auto">
									{#each Object.entries(selectedLog.change_diff) as [field, change]}
										<div class="border-l-2 border-blue-200 pl-3">
											<div class="font-semibold text-blue-900">{field}</div>
											<div class="text-red-700">Before: {JSON.stringify(change.before)}</div>
											<div class="text-green-700">After: {JSON.stringify(change.after)}</div>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-sm text-muted-foreground">No changes recorded</p>
							{/if}

							{#if selectedLog.reason}
								<div>
									<div class="text-sm font-semibold">Reason</div>
									<p class="text-sm text-muted-foreground mt-1">{selectedLog.reason}</p>
								</div>
							{/if}

							<div>
								<div class="text-sm font-semibold border-t pt-4">Details</div>
								<div class="text-[10px] sm:text-xs text-muted-foreground mt-2 grid grid-cols-2 gap-4">
									<div><span class="font-medium">By:</span> {selectedLog.user_email || 'System'}</div>
									<div><span class="font-medium">Role:</span> {selectedLog.user_role || 'N/A'}</div>
									<div><span class="font-medium">When:</span> {new Date(selectedLog.timestamp).toLocaleString()}</div>
									<div><span class="font-medium">From IP:</span> {selectedLog.ip_address || 'Unknown'}</div>
									<div class="col-span-2 truncate" title={selectedLog.user_agent}><span class="font-medium">Browser:</span> {selectedLog.user_agent ? selectedLog.user_agent.substring(0, 80) + '...' : 'Unknown'}</div>
								</div>
							</div>
						</div>
					{/if}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	{/if}

	<!-- Restore Confirmation Dialog -->
	<AlertDialog.Root bind:open={showRestoreDialog}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Restore Change</AlertDialog.Title>
				<AlertDialog.Description>
					Restore {restoreLog?.entity_type} to state before this action?
					<div class="mt-4 space-y-2 text-sm">
						<div><span class="font-semibold">Entity:</span> {restoreLog?.entity_id}</div>
						<div><span class="font-semibold">Action:</span> {restoreLog?.action}</div>
					</div>
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel onclick={cancelRestore}>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action onclick={confirmRestore}>Restore</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<!-- Results Summary -->
	{#if !isLoading}
		<p class="text-xs text-muted-foreground">
			Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredLogs.length)}–{Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} entries (Total: {auditLogs.length})
		</p>
	{/if}
</div>

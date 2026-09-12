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
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import {
		AlertCircle,
		ArrowDown,
		ArrowUp,
		ArrowUpDown,
		Calendar,
		ChevronLeft,
		ChevronRight,
		Download,
		FilterX,
		RefreshCw,
		Search,
		Undo2,
		Eye,
		X
	} from 'lucide-svelte';
	import { getAllAuditLogs, logAuditChange } from '$lib/utils/auditLogger';
	import type { AuditLogRecord } from '$lib/utils/auditLogger';
	import { devTools } from '$lib/stores/dev';
	import { supabase } from '$lib/supabase';
	import { toast } from 'svelte-sonner';

	// State
	let auditLogs = $state<AuditLogRecord[]>([]);
	let isLoading = $state(true);
	let selectedLog = $state<AuditLogRecord | null>(null);
	let showDetailView = $state(false);

	// Filters
	let filterEntity = $state('all');
	let filterAction = $state('all');
	let filterUser = $state('');
	let searchText = $state('');
	let datePreset = $state('all');
	let dateFrom = $state('');
	let dateTo = $state('');

	const filterEntityOptions = [
		{ value: 'all', label: 'All Types' },
		{ value: 'member', label: 'Member' },
		{ value: 'event', label: 'Event' },
		{ value: 'user', label: 'User' },
		{ value: 'settings', label: 'Settings' },
		{ value: 'attendance', label: 'Attendance' }
	];

	const filterActionOptions = [
		{ value: 'all', label: 'All Actions' },
		{ value: 'create', label: 'Create' },
		{ value: 'update', label: 'Update' },
		{ value: 'delete', label: 'Delete' },
		{ value: 'restore', label: 'Restore' },
		{ value: 'import', label: 'Import' }
	];

	const datePresetOptions = [
		{ value: 'all', label: 'All Time' },
		{ value: 'today', label: 'Today' },
		{ value: 'yesterday', label: 'Yesterday' },
		{ value: 'last7', label: 'Last 7 Days' },
		{ value: 'last30', label: 'Last 30 Days' },
		{ value: 'thisMonth', label: 'This Month' },
		{ value: 'lastMonth', label: 'Last Month' },
		{ value: 'custom', label: 'Custom Range' }
	];

	function formatDateISO(d: Date): string {
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function handleDatePresetChange(preset: string) {
		datePreset = preset;
		const now = new Date();

		if (preset === 'all') {
			dateFrom = '';
			dateTo = '';
		} else if (preset === 'today') {
			const str = formatDateISO(now);
			dateFrom = str;
			dateTo = str;
		} else if (preset === 'yesterday') {
			const prev = new Date(now);
			prev.setDate(prev.getDate() - 1);
			const str = formatDateISO(prev);
			dateFrom = str;
			dateTo = str;
		} else if (preset === 'last7') {
			const past = new Date(now);
			past.setDate(past.getDate() - 6);
			dateFrom = formatDateISO(past);
			dateTo = formatDateISO(now);
		} else if (preset === 'last30') {
			const past = new Date(now);
			past.setDate(past.getDate() - 29);
			dateFrom = formatDateISO(past);
			dateTo = formatDateISO(now);
		} else if (preset === 'thisMonth') {
			const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
			dateFrom = formatDateISO(firstDay);
			dateTo = formatDateISO(now);
		} else if (preset === 'lastMonth') {
			const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
			dateFrom = formatDateISO(firstDay);
			dateTo = formatDateISO(lastDay);
		}
	}

	function handleCustomDateInput() {
		datePreset = 'custom';
	}

	// Sorting State
	type SortColumn = 'created_at' | 'entity_type' | 'action' | 'user_email';
	let sortColumn = $state<SortColumn>('created_at');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	// Pagination State
	let currentPage = $state(1);
	let pageSize = $state(10);

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
		devTools.subscribe((state) => {
			auditEnabled = state.auditTrailEnabled;
			gdprMode = state.gdprModeEnabled;
			restrictUndoToAdmin = state.restrictUndoToAdmin;
			requireUndoApproval = state.requireUndoApproval;
		});

		await loadLogs();
	});

	// Active filters checker
	const hasActiveFilters = $derived(
		filterEntity !== 'all' ||
			filterAction !== 'all' ||
			filterUser !== '' ||
			searchText !== '' ||
			dateFrom !== '' ||
			dateTo !== '' ||
			sortColumn !== 'created_at' ||
			sortDirection !== 'desc'
	);

	function resetFilters() {
		filterEntity = 'all';
		filterAction = 'all';
		filterUser = '';
		searchText = '';
		dateFrom = '';
		dateTo = '';
		sortColumn = 'created_at';
		sortDirection = 'desc';
		currentPage = 1;
	}

	function handleSort(column: SortColumn) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = column === 'created_at' ? 'desc' : 'asc';
		}
	}

	// Reactive derived filtered & sorted logs
	const filteredLogs = $derived.by(() => {
		const filtered = auditLogs.filter((log) => {
			if (filterEntity !== 'all' && log.entity_type !== filterEntity) return false;
			if (filterAction !== 'all' && log.action !== filterAction) return false;
			if (filterUser && !log.user_email?.toLowerCase().includes(filterUser.toLowerCase())) return false;

			if (searchText) {
				const searchLower = searchText.toLowerCase();
				const matchSearch =
					(log.entity_id && log.entity_id.toLowerCase().includes(searchLower)) ||
					(log.user_email && log.user_email.toLowerCase().includes(searchLower)) ||
					(log.reason && log.reason.toLowerCase().includes(searchLower)) ||
					(log.tags && log.tags.some((t) => t.toLowerCase().includes(searchLower))) ||
					(log.entity_type && log.entity_type.toLowerCase().includes(searchLower)) ||
					(log.action && log.action.toLowerCase().includes(searchLower));
				if (!matchSearch) return false;
			}

			if (dateFrom) {
				const logDate = new Date(log.created_at);
				const fromDate = new Date(dateFrom);
				if (logDate < fromDate) return false;
			}

			if (dateTo) {
				const logDate = new Date(log.created_at);
				const toDate = new Date(dateTo);
				toDate.setDate(toDate.getDate() + 1);
				if (logDate > toDate) return false;
			}

			return true;
		});

		return filtered.sort((a, b) => {
			let aVal: string | number = '';
			let bVal: string | number = '';

			switch (sortColumn) {
				case 'created_at':
					aVal = new Date(a.created_at).getTime();
					bVal = new Date(b.created_at).getTime();
					break;
				case 'entity_type':
					aVal = (a.entity_type || '').toLowerCase() + (a.entity_id || '').toLowerCase();
					bVal = (b.entity_type || '').toLowerCase() + (b.entity_id || '').toLowerCase();
					break;
				case 'action':
					aVal = (a.action || '').toLowerCase();
					bVal = (b.action || '').toLowerCase();
					break;
				case 'user_email':
					aVal = (a.user_email || '').toLowerCase();
					bVal = (b.user_email || '').toLowerCase();
					break;
			}

			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredLogs.length / pageSize)));

	// Reset page index when filters change
	$effect(() => {
		void filterEntity;
		void filterAction;
		void filterUser;
		void searchText;
		void dateFrom;
		void dateTo;
		void sortColumn;
		void sortDirection;
		currentPage = 1;
	});

	// Derived paginated logs
	const paginatedLogs = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		const end = start + pageSize;
		return filteredLogs.slice(start, end);
	});

	async function loadLogs() {
		isLoading = true;
		try {
			const result = await getAllAuditLogs({}, 200);
			if (result.success && result.data) {
				auditLogs = result.data;
			}
		} catch (error) {
			console.error('Error loading audit logs:', error);
		} finally {
			isLoading = false;
		}
	}

	function getActionColor(action: string): string {
		switch (action) {
			case 'create':
				return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300';
			case 'update':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
			case 'delete':
				return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
			case 'restore':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
			case 'import':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
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
			const {
				data: { session }
			} = await supabase.auth.getSession();

			let restored = false;

			if (log.entity_type === 'member') {
				if (log.action === 'delete') {
					if (log.change_diff) {
						const reconstructed: Record<string, unknown> = { member_id: log.entity_id };
						for (const [field, change] of Object.entries(log.change_diff)) {
							reconstructed[field] = (change as Record<string, unknown>).before;
						}
						const { error } = await supabase.from('members').upsert(reconstructed);
						if (error) throw error;
						restored = true;
					} else {
						const { data: prevLogs } = await supabase
							.from('audit_logs')
							.select('*')
							.eq('entity_type', log.entity_type)
							.eq('entity_id', log.entity_id)
							.lt('created_at', log.created_at)
							.order('created_at', { ascending: false })
							.limit(50);

						if (prevLogs && prevLogs.length > 0) {
							let sourceLog = prevLogs.find(
								(l) => l.change_diff && (l.action === 'update' || l.action === 'create')
							);

							if (sourceLog && sourceLog.change_diff) {
								const reconstructed: Record<string, unknown> = { member_id: log.entity_id };
								for (const [field, change] of Object.entries(sourceLog.change_diff)) {
									reconstructed[field] = (change as Record<string, unknown>).after;
								}
								const { error } = await supabase.from('members').upsert(reconstructed);
								if (error) throw error;
								restored = true;
							}
						}
					}

					if (!restored) {
						throw new Error(
							`Cannot restore deleted member - deletion was not captured with member data. Restore may not be possible.`
						);
					}
				} else if (log.action === 'update' && log.change_diff) {
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
			} else if (log.entity_type === 'event') {
				const eventId = parseInt(log.entity_id);
				if (log.action === 'delete') {
					if (log.change_diff) {
						const reconstructed: Record<string, unknown> = { event_id: eventId };
						for (const [field, change] of Object.entries(log.change_diff)) {
							reconstructed[field] = (change as Record<string, unknown>).before;
						}
						const { error } = await supabase.from('events').upsert(reconstructed);
						if (error) throw error;
						restored = true;
					} else {
						const { data: prevLogs } = await supabase
							.from('audit_logs')
							.select('*')
							.eq('entity_type', log.entity_type)
							.eq('entity_id', log.entity_id)
							.lt('created_at', log.created_at)
							.order('created_at', { ascending: false })
							.limit(50);

						if (prevLogs && prevLogs.length > 0) {
							let sourceLog = prevLogs.find(
								(l) => l.change_diff && (l.action === 'update' || l.action === 'create')
							);

							if (sourceLog && sourceLog.change_diff) {
								const reconstructed: Record<string, unknown> = { event_id: eventId };
								for (const [field, change] of Object.entries(sourceLog.change_diff)) {
									reconstructed[field] = (change as Record<string, unknown>).after;
								}
								const { error } = await supabase.from('events').upsert(reconstructed);
								if (error) throw error;
								restored = true;
							}
						}
					}

					if (!restored) {
						throw new Error(
							`Cannot restore deleted event - deletion was not captured with event data. Restore may not be possible.`
						);
					}
				} else if (log.action === 'update' && log.change_diff) {
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
				throw new Error(
					`Cannot restore this action type (${log.action}). Only "update" and "delete" actions are restorable.`
				);
			}

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

<div class="flex w-full flex-col gap-6 p-4 md:p-6 lg:p-8">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Audit Logs</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Track all system changes, who made them, and when
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button onclick={loadLogs} variant="outline" size="sm" class="h-9">
				<RefreshCw class="mr-2 h-4 w-4" />
				Refresh
			</Button>
			<Button onclick={exportLogs} variant="outline" size="sm" class="h-9">
				<Download class="mr-2 h-4 w-4" />
				Export CSV
			</Button>
		</div>
	</div>

	<!-- System Summary Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Total Entries</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">{auditLogs.length}</div>
				<p class="mt-1 text-xs text-muted-foreground">All recorded logs</p>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Audit Status</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold text-green-600 dark:text-green-400">
					{auditEnabled ? 'Active' : 'Disabled'}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{auditEnabled ? 'Logging changes' : 'Dev mode pause'}
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">GDPR Mode</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">
					{gdprMode ? 'Enabled' : 'Disabled'}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{gdprMode ? 'Anonymization active' : 'Standard details'}
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Undo Access</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">
					{canUndo ? 'Allowed' : 'Restricted'}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{canUndo ? 'Staff & Admin' : 'Admin only'}
				</p>
			</CardContent>
		</Card>
	</div>

	<!-- Controls Toolbar (Search & Filters) -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap">
		<div class="flex flex-1 flex-wrap items-center gap-2.5">
			<div class="relative w-full sm:w-64">
				<Search class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Search logs..."
					bind:value={searchText}
					class="h-9 pl-9 text-xs rounded-lg border-input"
				/>
			</div>

			<Select.Root type="single" bind:value={filterEntity}>
				<Select.Trigger class="h-9 w-full sm:w-40 text-xs">
					<span>{filterEntityOptions.find((o) => o.value === filterEntity)?.label || 'All Types'}</span>
				</Select.Trigger>
				<Select.Content>
					{#each filterEntityOptions as opt}
						<Select.Item value={opt.value} class="text-xs">{opt.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			<Select.Root type="single" bind:value={filterAction}>
				<Select.Trigger class="h-9 w-full sm:w-36 text-xs">
					<span>{filterActionOptions.find((o) => o.value === filterAction)?.label || 'All Actions'}</span>
				</Select.Trigger>
				<Select.Content>
					{#each filterActionOptions as opt}
						<Select.Item value={opt.value} class="text-xs">{opt.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			<Select.Root type="single" value={datePreset} onValueChange={(val) => handleDatePresetChange(val)}>
				<Select.Trigger class="h-9 w-full sm:w-40 text-xs">
					<span>{datePresetOptions.find((o) => o.value === datePreset)?.label || 'All Time'}</span>
				</Select.Trigger>
				<Select.Content>
					{#each datePresetOptions as opt}
						<Select.Item value={opt.value} class="text-xs">{opt.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			{#if datePreset !== 'all'}
				<div class="flex items-center gap-1.5">
					<Input
						type="date"
						bind:value={dateFrom}
						onchange={handleCustomDateInput}
						class="h-9 w-36 text-xs"
						title="From date"
					/>
					<span class="text-xs text-muted-foreground">to</span>
					<Input
						type="date"
						bind:value={dateTo}
						onchange={handleCustomDateInput}
						class="h-9 w-36 text-xs"
						title="To date"
					/>
				</div>
			{/if}
		</div>

		{#if hasActiveFilters}
			<Button
				variant="outline"
				size="sm"
				onclick={resetFilters}
				class="h-9 text-xs gap-1.5 self-start sm:self-auto"
			>
				<FilterX class="h-3.5 w-3.5" />
				Reset Filters
			</Button>
		{/if}
	</div>

	<!-- Table Container -->
	<div class="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
		{#if isLoading}
			<div class="flex items-center justify-center py-16">
				<div class="text-center">
					<RefreshCw class="mx-auto mb-2 h-8 w-8 animate-spin text-primary" />
					<p class="text-sm text-muted-foreground">Loading audit logs...</p>
				</div>
			</div>
		{:else if filteredLogs.length === 0}
			<div class="py-16 text-center">
				<AlertCircle class="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
				<p class="text-sm font-medium text-foreground">No audit logs found</p>
				<p class="mt-1 text-xs text-muted-foreground">Try clearing or adjusting your search filters</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<Table class="w-full">
					<TableHeader>
						<TableRow class="bg-muted/40 hover:bg-muted/40">
							<TableHead class="px-4 py-3.5 sm:px-6">
								<Button
									variant="ghost"
									size="sm"
									class="-ml-3 h-8 text-xs font-semibold hover:bg-transparent"
									onclick={() => handleSort('created_at')}
								>
									Timestamp
									{#if sortColumn === 'created_at'}
										{#if sortDirection === 'asc'}
											<ArrowUp class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{:else}
											<ArrowDown class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{/if}
									{:else}
										<ArrowUpDown class="ml-1.5 h-3.5 w-3.5 opacity-40" />
									{/if}
								</Button>
							</TableHead>
							<TableHead class="px-4 py-3.5 sm:px-6">
								<Button
									variant="ghost"
									size="sm"
									class="-ml-3 h-8 text-xs font-semibold hover:bg-transparent"
									onclick={() => handleSort('entity_type')}
								>
									Entity
									{#if sortColumn === 'entity_type'}
										{#if sortDirection === 'asc'}
											<ArrowUp class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{:else}
											<ArrowDown class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{/if}
									{:else}
										<ArrowUpDown class="ml-1.5 h-3.5 w-3.5 opacity-40" />
									{/if}
								</Button>
							</TableHead>
							<TableHead class="px-4 py-3.5 sm:px-6">
								<Button
									variant="ghost"
									size="sm"
									class="-ml-3 h-8 text-xs font-semibold hover:bg-transparent"
									onclick={() => handleSort('action')}
								>
									Action
									{#if sortColumn === 'action'}
										{#if sortDirection === 'asc'}
											<ArrowUp class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{:else}
											<ArrowDown class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{/if}
									{:else}
										<ArrowUpDown class="ml-1.5 h-3.5 w-3.5 opacity-40" />
									{/if}
								</Button>
							</TableHead>
							<TableHead class="px-4 py-3.5 sm:px-6">
								<Button
									variant="ghost"
									size="sm"
									class="-ml-3 h-8 text-xs font-semibold hover:bg-transparent"
									onclick={() => handleSort('user_email')}
								>
									User
									{#if sortColumn === 'user_email'}
										{#if sortDirection === 'asc'}
											<ArrowUp class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{:else}
											<ArrowDown class="ml-1.5 h-3.5 w-3.5 text-primary" />
										{/if}
									{:else}
										<ArrowUpDown class="ml-1.5 h-3.5 w-3.5 opacity-40" />
									{/if}
								</Button>
							</TableHead>
							<TableHead class="px-4 py-3.5 sm:px-6 text-xs font-semibold">Details</TableHead>
							<TableHead class="px-4 py-3.5 sm:px-6 text-right text-xs font-semibold">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each paginatedLogs as log (log.id)}
							<TableRow class="transition-colors hover:bg-muted/50">
								<TableCell class="px-4 py-3.5 sm:px-6 font-mono text-xs">
									{formatDate(log.created_at)}
								</TableCell>
								<TableCell class="px-4 py-3.5 sm:px-6">
									<Badge variant="outline" class="font-medium text-xs">{log.entity_type}</Badge>
									<div class="mt-1 font-mono text-[11px] text-muted-foreground">{log.entity_id}</div>
								</TableCell>
								<TableCell class="px-4 py-3.5 sm:px-6">
									<Badge class={getActionColor(log.action)}>
										{log.action}
									</Badge>
								</TableCell>
								<TableCell class="px-4 py-3.5 sm:px-6 text-xs">
									<div class="font-medium">{log.user_email}</div>
									<div class="text-[11px] text-muted-foreground">{log.user_role}</div>
								</TableCell>
								<TableCell class="px-4 py-3.5 sm:px-6 max-w-xs truncate text-xs">
									{#if log.reason}
										{log.reason}
									{:else if log.tags?.length}
										{log.tags.join(', ')}
									{:else}
										—
									{/if}
								</TableCell>
								<TableCell class="px-4 py-3.5 sm:px-6 text-right">
									<div class="flex items-center justify-end gap-1">
										<Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={() => toggleDetailView(log)} title="View log details">
											<Eye class="h-4 w-4 text-muted-foreground hover:text-foreground" />
										</Button>
										{#if log.action !== 'restore'}
											<Button
												variant="ghost"
												size="sm"
												class="h-8 w-8 p-0"
												onclick={() => openRestoreDialog(log)}
												title={canUndo
													? 'Undo this change'
													: restrictUndoToAdmin
														? 'Undo restricted to admin only'
														: requireUndoApproval
															? 'Undo approval required'
															: 'Cannot undo'}
											>
												<Undo2 class={`h-4 w-4 ${!canUndo ? 'opacity-50' : 'text-muted-foreground hover:text-foreground'}`} />
											</Button>
										{/if}
									</div>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		{/if}

		<!-- Desktop & Mobile Pagination Controls -->
		{#if filteredLogs.length > 0}
			<div
				class="flex flex-col items-center justify-between gap-4 border-t bg-card p-4 sm:px-6 sm:py-4 shadow-xs sm:flex-row"
			>
				<div class="flex items-center gap-4 text-xs text-muted-foreground">
					<span>
						Showing <strong>{Math.min((currentPage - 1) * pageSize + 1, filteredLogs.length)}</strong> to{' '}
						<strong>{Math.min(currentPage * pageSize, filteredLogs.length)}</strong> of{' '}
						<strong>{filteredLogs.length}</strong> entries
					</span>
					<div class="flex items-center gap-1.5">
						<span>Per page:</span>
						<select
							bind:value={pageSize}
							onchange={() => (currentPage = 1)}
							class="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
						>
							<option value={10}>10</option>
							<option value={25}>25</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
						</select>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={currentPage === 1}
						onclick={() => (currentPage = Math.max(1, currentPage - 1))}
						class="h-8 gap-1 px-3 text-xs"
					>
						<ChevronLeft class="h-3.5 w-3.5" />
						Previous
					</Button>
					<span class="px-2 text-xs font-medium text-muted-foreground">
						Page {currentPage} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={currentPage >= totalPages}
						onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
						class="h-8 gap-1 px-3 text-xs"
					>
						Next
						<ChevronRight class="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Detail Modal -->
	<Dialog.Root bind:open={showDetailView}>
		<Dialog.Portal>
			<Dialog.Overlay
				class="pointer-events-none fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
			/>
			<Dialog.Content
				class="pointer-events-auto fixed top-[50%] left-[50%] z-50 grid max-h-[90vh] w-[95vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-xl border bg-card p-4 shadow-lg duration-200 sm:p-6"
			>
				<div class="relative">
					<Dialog.Close
						class="absolute top-0 right-0 p-1 opacity-70 transition-opacity hover:opacity-100"
					>
						<X class="h-5 w-5 text-muted-foreground" />
					</Dialog.Close>
					<Dialog.Header>
						<Dialog.Title class="mr-8 text-lg font-semibold">Change Details</Dialog.Title>
						<Dialog.Description class="mt-1 text-sm text-muted-foreground">
							{selectedLog?.entity_type} #{selectedLog?.entity_id} - {selectedLog?.action}
						</Dialog.Description>
					</Dialog.Header>
				</div>

				{#if selectedLog}
					<div class="space-y-4">
						{#if selectedLog.change_diff}
							<div
								class="space-y-3 overflow-x-auto rounded-md bg-slate-50 p-4 font-mono text-xs sm:text-sm dark:bg-slate-900"
							>
								{#each Object.entries(selectedLog.change_diff) as [field, change]}
									<div class="border-l-2 border-blue-500/50 pl-3">
										<div class="font-semibold text-blue-900 dark:text-blue-300">{field}</div>
										<div class="text-red-700 dark:text-red-400">Before: {JSON.stringify(change.before)}</div>
										<div class="text-green-700 dark:text-green-400">After: {JSON.stringify(change.after)}</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-sm text-muted-foreground">No changes recorded</p>
						{/if}

						{#if selectedLog.reason}
							<div>
								<div class="text-sm font-semibold">Reason</div>
								<p class="mt-1 text-sm text-muted-foreground">{selectedLog.reason}</p>
							</div>
						{/if}

						<div>
							<div class="border-t pt-4 text-sm font-semibold">Details</div>
							<div
								class="mt-2 grid grid-cols-2 gap-4 text-[10px] text-muted-foreground sm:text-xs"
							>
								<div>
									<span class="font-medium">By:</span>
									{selectedLog.user_email || 'System'}
								</div>
								<div><span class="font-medium">Role:</span> {selectedLog.user_role || 'N/A'}</div>
								<div>
									<span class="font-medium">When:</span>
									{new Date(selectedLog.timestamp).toLocaleString()}
								</div>
								<div>
									<span class="font-medium">From IP:</span>
									{selectedLog.ip_address || 'Unknown'}
								</div>
								<div class="col-span-2 truncate" title={selectedLog.user_agent}>
									<span class="font-medium">Browser:</span>
									{selectedLog.user_agent
										? selectedLog.user_agent.substring(0, 80) + '...'
										: 'Unknown'}
								</div>
							</div>
						</div>
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>

	<!-- Restore Modal -->
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
</div>

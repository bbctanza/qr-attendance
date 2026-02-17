<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import {
		Sheet,
		SheetContent,
		SheetHeader,
		SheetTitle,
		SheetFooter
	} from '$lib/components/ui/sheet';
	import {
		Drawer,
		DrawerContent,
		DrawerHeader,
		DrawerTitle,
		DrawerFooter
	} from '$lib/components/ui/drawer';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import { Plus, Edit, Trash2, Search, Users, ChevronDown } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import Color from 'svelte-awesome-color-picker';
	import { supabase } from '$lib/supabase';
	import FullPageLoading from '$lib/components/full-page-loading.svelte';

	// Get the primary theme color from CSS variable
	function getThemeColor(): string {
		if (typeof window === 'undefined') return '#3B82F6';
		const oklchColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--primary')
			.trim();
		// oklch colors from CSS need to be converted to hex
		// For now, we'll parse oklch format and convert to hex
		// oklch(0.5 0.207 142.647) -> extract values and convert
		const match = oklchColor.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
		if (match) {
			const [, L, C, H] = match;
			return oklchToHex(parseFloat(L), parseFloat(C), parseFloat(H));
		}
		return '#3B82F6';
	}

	// Convert OKLCH to Hex
	function oklchToHex(L: number, C: number, H: number): string {
		// OKLCH to Linear RGB conversion
		const h = (H * Math.PI) / 180;
		const a = C * Math.cos(h);
		const b = C * Math.sin(h);

		const l = L + 0.3963377774 * a + 0.2158037573 * b;
		const m = L - 0.1055613458 * a - 0.0638541728 * b;
		const s = L - 0.0894841775 * a - 1.291485548 * b;

		const l3 = l * l * l;
		const m3 = m * m * m;
		const s3 = s * s * s;

		const r = +4.0767416621 * l3 - 3.3077363322 * m3 + 0.2309101289 * s3;
		const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193761 * s3;
		const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

		const toHex = (v: number) => {
			const c = Math.max(0, Math.min(1, v));
			const x = Math.round(c * 255);
			const hex = x.toString(16);
			return hex.length === 1 ? '0' + hex : hex;
		};

		return '#' + toHex(r) + toHex(g) + toHex(bl);
	}

	// Real groups data
	let groups = $state<any[]>([]);

	let showGroupDialog = $state(false);
	let isEditingGroup = $state(false);
	let editingGroupId: number | null = $state(null);
	let isMobile = $state(false);
	let searchQuery = $state('');
	let sortBy = $state<'name' | 'members'>('name');
	let isLoading = $state(true);

	let defaultColor = $state('#3B82F6');
	let groupForm: any = $state({ name: '', description: '', members: 0, color: '#3B82F6' });
	let showDeleteDialog = $state(false);
	let groupToDelete: number | null = $state(null);
	let isDeletingGroup = $state(false);

	onMount(async () => {
		isLoading = true;
		try {
			await fetchGroups();
		} finally {
			isLoading = false;
		}
	});

	async function fetchGroups() {
		const { data: groupsData, error } = await supabase.from('groups').select('*');
		if (groupsData) {
			// Fetch member counts for each group
			const groupsWithCounts = await Promise.all(
				groupsData.map(async (g) => {
					const { count } = await supabase
						.from('members')
						.select('*', { count: 'exact', head: true })
						.eq('group_id', g.group_id);

					return {
						id: g.group_id,
						name: g.group_code,
						description: g.name || '',
						members: count || 0,
						active: true,
						color: g.metadata?.color || defaultColor
					};
				})
			);

			groups = groupsWithCounts;
		}
	}

	// Derived stats
	let totalGroups = $derived(groups.length);
	let activeGroups = $derived(groups.filter((g) => g.active).length);
	let totalMembers = $derived(groups.reduce((sum, g) => sum + g.members, 0));

	// Derived filtered groups
	let filteredGroups = $derived(
		groups
			.filter(
				(g) =>
					g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					g.description.toLowerCase().includes(searchQuery.toLowerCase())
			)
			.sort((a, b) => {
				if (sortBy === 'name') {
					return a.name.localeCompare(b.name);
				} else if (sortBy === 'members') {
					return b.members - a.members;
				}
				return 0;
			})
	);

	function openAddGroup() {
		isEditingGroup = false;
		editingGroupId = null;
		groupForm = { name: '', description: '', members: 0, color: defaultColor };
		showGroupDialog = true;
	}

	function editGroup(id: number) {
		const g = groups.find((x) => x.id === id);
		if (!g) {
			console.error('Group not found:', id);
			toast.error('Group not found');
			return;
		}
		isEditingGroup = true;
		editingGroupId = id;
		// Create a new object to ensure reactivity
		groupForm = {
			name: g.name || '',
			description: g.description || '',
			members: g.members || 0,
			color: g.color || defaultColor
		};
		console.log('Editing group:', id, groupForm);
		showGroupDialog = true;
	}

	async function saveGroup() {
		if (!groupForm.name.trim()) {
			toast.error('Please enter a group name');
			return;
		}

		const trimmedName = groupForm.name.trim();
		const trimmedDescription = groupForm.description.trim();

		if (isEditingGroup && editingGroupId != null) {
			console.log('Updating group:', editingGroupId, {
				group_code: trimmedName,
				name: trimmedDescription,
				metadata: { color: groupForm.color }
			});
			const { error, data } = await supabase
				.from('groups')
				.update({
					group_code: trimmedName,
					name: trimmedDescription,
					metadata: { color: groupForm.color }
				})
				.eq('group_id', editingGroupId);

			if (error) {
				console.error('Update error:', error);
				toast.error(error.message || 'Failed to update group');
				return;
			}

			console.log('Update successful:', data);
			toast.success(`Group "${trimmedName}" updated`);
		} else {
			// Check if group code already exists
			const { data: existingGroup, error: checkError } = await supabase
				.from('groups')
				.select('group_id')
				.eq('group_code', trimmedName)
				.single();

			if (existingGroup) {
				toast.error(`A group with code "${trimmedName}" already exists`);
				return;
			}

			if (checkError && checkError.code !== 'PGRST116') {
				// PGRST116 means no rows found, which is expected
				console.error('Check error:', checkError);
			}

			console.log('Creating group:', {
				group_code: trimmedName,
				name: trimmedDescription,
				metadata: { color: groupForm.color }
			});
			const { error, data } = await supabase.from('groups').insert({
				group_code: trimmedName,
				name: trimmedDescription,
				metadata: { color: groupForm.color }
			});

			if (error) {
				console.error('Insert error:', error);
				toast.error(error.message || 'Failed to create group');
				return;
			}

			console.log('Insert successful:', data);
			toast.success(`Group "${trimmedName}" created`);
		}

		await fetchGroups();
		showGroupDialog = false;
		location.reload();
	}

	function openDeleteDialog(id: number) {
		groupToDelete = id;
		showDeleteDialog = true;
	}

	async function confirmDeleteGroup() {
		if (groupToDelete === null || isDeletingGroup) return;

		const id = groupToDelete;
		console.log('Deleting group:', id);
		
		isDeletingGroup = true;
		try {
			const { error } = await supabase.from('groups').delete().eq('group_id', id);

			if (error) {
				console.error('Delete error:', error);
				toast.error(error.message || 'Failed to delete group');
				return;
			}

			await fetchGroups();
			toast.success('Group deleted');
		} catch (error: any) {
			console.error('Delete error:', error);
			const msg = error?.message || 'Unknown error';
			toast.error(`Failed to delete group: ${msg}`);
		} finally {
			isDeletingGroup = false;
			showDeleteDialog = false;
			groupToDelete = null;
		}
	}

	// Media query listener for responsive drawer/dialog
	onMount(() => {
		// Get theme color on mount
		defaultColor = getThemeColor();

		const mediaQuery = window.matchMedia('(min-width: 640px)');
		isMobile = !mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			isMobile = !e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

{#if isLoading}
	<FullPageLoading message="Synchronizing groups..." />
{:else}
	<div
		class="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:gap-6 md:px-12 md:py-10 lg:px-16 lg:py-12"
	>
		<!-- Header with Add Button -->
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="hidden text-2xl font-bold sm:block md:text-3xl">Groups Management</h1>
				<p class="mt-1 hidden text-muted-foreground sm:block">Manage and organize team groups</p>
			</div>
			<Button onclick={openAddGroup} class="w-full sm:w-auto">
				<Plus class="mr-2 h-4 w-4" />
				Add New Group
			</Button>
		</div>

		<!-- Search -->
		<div class="relative">
			<Search class="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				bind:value={searchQuery}
				placeholder="Search groups..."
				class="rounded-2xl py-3 pl-10"
			/>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-3 gap-2">
			<Card>
				<CardContent class="flex flex-col items-center justify-center p-4">
					<Users class="mb-2 h-6 w-6 text-muted-foreground" />
					<div class="mb-1 text-2xl font-bold">{totalGroups}</div>
					<div class="text-center text-sm font-medium">Total Groups</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="flex flex-col items-center justify-center p-4">
					<Users class="mb-2 h-6 w-6 text-green-500" />
					<div class="mb-1 text-2xl font-bold text-green-500">{activeGroups}</div>
					<div class="text-center text-sm font-medium">Active</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="flex flex-col items-center justify-center p-4">
					<Users class="mb-2 h-6 w-6 text-blue-500" />
					<div class="mb-1 text-2xl font-bold text-blue-500">{totalMembers}</div>
					<div class="text-center text-sm font-medium">Members</div>
				</CardContent>
			</Card>
		</div>

		<!-- Groups List -->
		<div>
			<h2 class="mb-4 text-xl font-semibold">Groups</h2>
			<div class="hidden grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid lg:grid-cols-3">
				{#each filteredGroups as group}
					<Card>
						<CardContent class="p-4">
							<div class="space-y-3">
								<!-- Header -->
								<div>
									<h3 class="text-base font-medium">{group.name}</h3>
									<p class="mt-1 text-sm text-muted-foreground">{group.description}</p>
								</div>
								<!-- Members Badge -->
								<div class="flex items-center justify-between border-t pt-3">
									<div
										class="rounded-full px-2 py-1 text-xs font-medium"
										style="background-color: {group.color}20; color: {group.color};"
									>
										{group.members} members
									</div>
									<div class="flex items-center gap-1">
										<Button variant="ghost" size="sm" onclick={() => editGroup(group.id)}>
											<Edit class="h-4 w-4" />
										</Button>
										<Button variant="ghost" size="sm" onclick={() => openDeleteDialog(group.id)}>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
				{#if filteredGroups.length === 0}
					<div class="col-span-full flex flex-col items-center justify-center py-12 text-center">
						<Users class="mb-4 h-12 w-12 text-muted-foreground/50" />
						<p class="font-medium text-muted-foreground">No groups found</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Try adjusting your search or create a new group
						</p>
					</div>
				{/if}
			</div>

			<!-- Mobile/Tablet View -->
			<div class="space-y-3 sm:space-y-4 lg:hidden">
				{#each filteredGroups as group}
					<Card>
						<CardContent class="p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
									<h3 class="truncate text-sm font-medium sm:text-base">{group.name}</h3>
									<div
										class="mt-1 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2"
									>
										<div class="flex items-center gap-1">
											<Users class="h-3 w-3" />
											<span class="truncate">{group.description}</span>
										</div>
										<div class="flex items-center gap-1">
											<span
												class="rounded-full px-2 py-0.5 text-xs font-medium"
												style="background-color: {group.color}20; color: {group.color};"
											>
												{group.members} members
											</span>
										</div>
									</div>
								</div>
								<div class="ml-2 flex shrink-0 items-center gap-1">
									<Button variant="ghost" size="sm" onclick={() => editGroup(group.id)}>
										<Edit class="h-4 w-4" />
									</Button>
									<Button variant="ghost" size="sm" onclick={() => openDeleteDialog(group.id)}>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
				{#if filteredGroups.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<Users class="mb-4 h-12 w-12 text-muted-foreground/50" />
						<p class="font-medium text-muted-foreground">No groups found</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Try adjusting your search or create a new group
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Drawer (Mobile) -->
		{#if isMobile}
			<Drawer bind:open={showGroupDialog}>
				<DrawerContent class="max-h-[90vh]">
					<DrawerHeader>
						<DrawerTitle class="text-lg font-semibold"
							>{isEditingGroup ? 'Edit Group' : 'Add Group'}</DrawerTitle
						>
					</DrawerHeader>
					<div class="max-h-[calc(90vh-180px)] overflow-y-auto px-4 pb-4">
						<div class="space-y-4">
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Group Name</Label>
								<Input
									bind:value={groupForm.name}
									placeholder="e.g. ENGINEERING"
									class="mt-2 w-full rounded-xl border-input py-3"
								/>
							</div>
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Description</Label>
								<Input
									bind:value={groupForm.description}
									placeholder="Short description"
									class="mt-2 w-full rounded-xl border-input py-3"
								/>
							</div>
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Group Color</Label>
								<div class="mt-2">
									<Color bind:hex={groupForm.color} />
								</div>
							</div>
						</div>
					</div>
					<DrawerFooter class="flex gap-3 border-t px-4 pb-4">
						<Button
							class="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
							onclick={() => (showGroupDialog = false)}>Cancel</Button
						>
						<Button class="w-full" onclick={saveGroup}
							>{isEditingGroup ? 'Update Group' : 'Create Group'}</Button
						>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		{:else}
			<!-- Sheet (Desktop) -->
			<Sheet bind:open={showGroupDialog}>
				<SheetContent class="hidden flex-col sm:flex sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle class="text-lg font-semibold"
							>{isEditingGroup ? 'Edit Group' : 'Add Group'}</SheetTitle
						>
					</SheetHeader>
					<div class="flex-1 overflow-y-auto px-4 py-6">
						<div class="space-y-4">
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Group Name</Label>
								<Input
									bind:value={groupForm.name}
									placeholder="e.g. ENGINEERING"
									class="mt-2 w-full rounded-xl border-input py-3"
								/>
							</div>
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Description</Label>
								<Input
									bind:value={groupForm.description}
									placeholder="Short description"
									class="mt-2 w-full rounded-xl border-input py-3"
								/>
							</div>
							<div>
								<Label class="text-xs font-bold tracking-wider uppercase">Group Color</Label>
								<div class="mt-2">
									<Color bind:hex={groupForm.color} />
								</div>
							</div>
						</div>
					</div>
					<SheetFooter class="flex gap-3 px-4 pb-4">
						<Button
							class="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80 md:w-auto"
							onclick={() => (showGroupDialog = false)}>Cancel</Button
						>
						<Button class="w-full md:w-auto" onclick={saveGroup}
							>{isEditingGroup ? 'Update Group' : 'Create Group'}</Button
						>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		{/if}
	</div>
{/if}

<!-- Delete Confirmation Dialog -->
<AlertDialog bind:open={showDeleteDialog}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete Group</AlertDialogTitle>
			<AlertDialogDescription>
				Are you sure you want to delete this group? This action cannot be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<div class="flex justify-end gap-3">
			<AlertDialogCancel disabled={isDeletingGroup}>Cancel</AlertDialogCancel>
			<AlertDialogAction
				class="bg-destructive hover:bg-destructive/90"
				disabled={isDeletingGroup}
				onclick={confirmDeleteGroup}
			>
				{#if isDeletingGroup}
					<div class="flex items-center gap-2">
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
						<span>Deleting...</span>
					</div>
				{:else}
					Delete
				{/if}
			</AlertDialogAction>
		</div>
	</AlertDialogContent>
</AlertDialog>

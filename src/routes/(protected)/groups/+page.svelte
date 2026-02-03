<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Label } from "$lib/components/ui/label";
	import { Input } from "$lib/components/ui/input";
	import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "$lib/components/ui/sheet";
	import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "$lib/components/ui/drawer";
	import { Plus, Edit, Trash2, Search, Users, ChevronDown } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { onMount } from "svelte";
	import Color from "svelte-awesome-color-picker";
    import { supabase } from "$lib/supabase";

	// Get the primary theme color from CSS variable
	function getThemeColor(): string {
		if (typeof window === 'undefined') return '#3B82F6';
		const oklchColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
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
		const s = L - 0.0894841775 * a - 1.2914855480 * b;

		const l3 = l * l * l;
		const m3 = m * m * m;
		const s3 = s * s * s;

		const r = +4.0767416621 * l3 - 3.3077363322 * m3 + 0.2309101289 * s3;
		const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193761 * s3;
		const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

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

	let defaultColor = $state('#3B82F6');
	let groupForm: any = $state({ name: '', description: '', members: 0, color: '#3B82F6' });

    onMount(() => {
        fetchGroups();
    });

    async function fetchGroups() {
        const { data: groupsData, error } = await supabase.from('groups').select('*');
        if (groupsData) {
            // Fetch member counts for each group
            const groupsWithCounts = await Promise.all(groupsData.map(async (g) => {
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
            }));
            
            groups = groupsWithCounts;
        }
    }

	// Derived stats
	let totalGroups = $derived(groups.length);
	let activeGroups = $derived(groups.filter(g => g.active).length);
	let totalMembers = $derived(groups.reduce((sum, g) => sum + g.members, 0));

	// Derived filtered groups
	let filteredGroups = $derived(
		groups.filter(g => 
			g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
			g.description.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	function openAddGroup() {
		isEditingGroup = false;
		editingGroupId = null;
		groupForm = { name: '', description: '', members: 0, color: defaultColor };
		showGroupDialog = true;
	}

	function editGroup(id: number) {
		const g = groups.find(x => x.id === id);
		if (!g) return;
		isEditingGroup = true;
		editingGroupId = id;
		groupForm = { name: g.name, description: g.description, members: g.members, color: g.color };
		showGroupDialog = true;
	}

	async function saveGroup() {
		if (!groupForm.name.trim()) {
			toast.error('Please enter a group name');
			return;
		}

		if (isEditingGroup && editingGroupId != null) {
            const { error } = await supabase.from('groups').update({
                group_code: groupForm.name,
                name: groupForm.description,
                metadata: { color: groupForm.color }
            }).eq('group_id', editingGroupId);

            if (error) {
                console.error(error);
                toast.error("Failed to update group");
                return;
            }

			toast.success(`Group "${groupForm.name}" updated`);
		} else {
            const { error } = await supabase.from('groups').insert({
                group_code: groupForm.name,
                name: groupForm.description,
                metadata: { color: groupForm.color }
            });

             if (error) {
                console.error(error);
                toast.error("Failed to create group");
                return;
            }

			toast.success(`Group "${groupForm.name}" created`);
		}
        
        await fetchGroups();
		showGroupDialog = false;
	}

	async function deleteGroup(id: number) {
		// simple placeholder; confirm
		if (!confirm('Delete this group? This action cannot be undone.')) return;
        
        const { error } = await supabase.from('groups').delete().eq('group_id', id);

        if (error) {
            console.error(error);
            toast.error("Failed to delete group");
            return;
        }

        await fetchGroups();
		toast.success('Group deleted');
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

<div class="flex flex-col gap-4 md:gap-6 p-4 md:px-12 md:py-10 lg:px-16 lg:py-12 max-w-7xl mx-auto">
	<!-- Header with Add Button -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h1 class="hidden sm:block text-2xl md:text-3xl font-bold">Groups Management</h1>
			<p class="hidden sm:block text-muted-foreground mt-1">Manage and organize team groups</p>
		</div>
		<Button onclick={openAddGroup} class="w-full sm:w-auto">
			<Plus class="mr-2 h-4 w-4" />
			Add New Group
		</Button>
	</div>

	<!-- Search -->
	<div class="relative">
		<Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
		<Input 
			bind:value={searchQuery}
			placeholder="Search groups..."
			class="pl-10 rounded-2xl py-3"
		/>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-3 gap-2">
		<Card>
			<CardContent class="flex flex-col items-center justify-center p-4">
				<Users class="h-6 w-6 text-muted-foreground mb-2" />
				<div class="text-2xl font-bold mb-1">{totalGroups}</div>
				<div class="text-sm font-medium text-center">Total Groups</div>
			</CardContent>
		</Card>
		<Card>
			<CardContent class="flex flex-col items-center justify-center p-4">
				<Users class="h-6 w-6 text-green-500 mb-2" />
				<div class="text-2xl font-bold text-green-500 mb-1">{activeGroups}</div>
				<div class="text-sm font-medium text-center">Active</div>
			</CardContent>
		</Card>
		<Card>
			<CardContent class="flex flex-col items-center justify-center p-4">
				<Users class="h-6 w-6 text-blue-500 mb-2" />
				<div class="text-2xl font-bold text-blue-500 mb-1">{totalMembers}</div>
				<div class="text-sm font-medium text-center">Members</div>
			</CardContent>
		</Card>
	</div>

	<!-- Groups List -->
	<div>
		<h2 class="text-xl font-semibold mb-4">Groups</h2>
		<div class="hidden lg:grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredGroups as group}
				<Card>
					<CardContent class="p-4">
						<div class="space-y-3">
							<!-- Header -->
							<div>
								<h3 class="font-medium text-base">{group.name}</h3>
								<p class="text-sm text-muted-foreground mt-1">{group.description}</p>
							</div>
							<!-- Members Badge -->
							<div class="flex items-center justify-between pt-3 border-t">
								<div class="px-2 py-1 rounded-full text-xs font-medium" style="background-color: {group.color}20; color: {group.color};">
									{group.members} members
								</div>
								<div class="flex items-center gap-1">
									<Button variant="ghost" size="sm" onclick={() => editGroup(group.id)}>
										<Edit class="h-4 w-4" />
									</Button>
									<Button variant="ghost" size="sm" onclick={() => deleteGroup(group.id)}>
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
					<Users class="h-12 w-12 text-muted-foreground/50 mb-4" />
					<p class="text-muted-foreground font-medium">No groups found</p>
					<p class="text-xs text-muted-foreground mt-1">Try adjusting your search or create a new group</p>
				</div>
			{/if}
		</div>

		<!-- Mobile/Tablet View -->
		<div class="lg:hidden space-y-3 sm:space-y-4">
			{#each filteredGroups as group}
				<Card>
					<CardContent class="p-3 sm:p-4">
						<div class="flex items-center justify-between">
							<div class="min-w-0 flex-1">
								<h3 class="font-medium truncate text-sm sm:text-base">{group.name}</h3>
								<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
									<div class="flex items-center gap-1">
										<Users class="h-3 w-3" />
										<span class="truncate">{group.description}</span>
									</div>
									<div class="flex items-center gap-1">
										<span class="px-2 py-0.5 rounded-full text-xs font-medium" style="background-color: {group.color}20; color: {group.color};">
											{group.members} members
										</span>
									</div>
								</div>
							</div>
							<div class="flex items-center gap-1 ml-2 shrink-0">
								<Button variant="ghost" size="sm" onclick={() => editGroup(group.id)}>
									<Edit class="h-4 w-4" />
								</Button>
								<Button variant="ghost" size="sm" onclick={() => deleteGroup(group.id)}>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			{/each}
			{#if filteredGroups.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<Users class="h-12 w-12 text-muted-foreground/50 mb-4" />
					<p class="text-muted-foreground font-medium">No groups found</p>
					<p class="text-xs text-muted-foreground mt-1">Try adjusting your search or create a new group</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Drawer (Mobile) -->
	{#if isMobile}
		<Drawer bind:open={showGroupDialog}>
			<DrawerContent class="max-h-[90vh]">
				<DrawerHeader>
					<DrawerTitle class="text-lg font-semibold">{isEditingGroup ? 'Edit Group' : 'Add Group'}</DrawerTitle>
				</DrawerHeader>
				<div class="px-4 pb-4 overflow-y-auto max-h-[calc(90vh-180px)]">
					<div class="space-y-4">
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Group Name</Label>
							<Input bind:value={groupForm.name} placeholder="e.g. ENGINEERING" class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Description</Label>
							<Input bind:value={groupForm.description} placeholder="Short description" class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Group Color</Label>
							<div class="mt-2">
								<Color bind:hex={groupForm.color} />
							</div>
						</div>
					</div>
				</div>
				<DrawerFooter class="flex gap-3 px-4 pb-4 border-t">
					<Button class="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground" onclick={() => (showGroupDialog = false)}>Cancel</Button>
					<Button class="w-full" onclick={saveGroup}>{isEditingGroup ? 'Update Group' : 'Create Group'}</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	{:else}
		<!-- Sheet (Desktop) -->
		<Sheet bind:open={showGroupDialog}>
			<SheetContent class="sm:max-w-2xl hidden sm:flex flex-col">
				<SheetHeader>
					<SheetTitle class="text-lg font-semibold">{isEditingGroup ? 'Edit Group' : 'Add Group'}</SheetTitle>
				</SheetHeader>
				<div class="flex-1 overflow-y-auto px-4 py-6">
					<div class="space-y-4">
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Group Name</Label>
							<Input bind:value={groupForm.name} placeholder="e.g. ENGINEERING" class="mt-2 rounded-xl py-3 w-full border-input" />
						</div>
						<div>
							<Label class="text-xs font-bold tracking-wider uppercase">Description</Label>
							<Input bind:value={groupForm.description} placeholder="Short description" class="mt-2 rounded-xl py-3 w-full border-input" />
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
					<Button class="w-full md:w-auto bg-secondary hover:bg-secondary/80 text-secondary-foreground" onclick={() => (showGroupDialog = false)}>Cancel</Button>
					<Button class="w-full md:w-auto" onclick={saveGroup}>{isEditingGroup ? 'Update Group' : 'Create Group'}</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	{/if}
</div>

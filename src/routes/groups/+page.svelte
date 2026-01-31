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

	// Mock groups data
	let groups = $state([
		{ id: 1, name: 'ENGINEERING', description: 'Platform and backend teams', members: 12, active: true, color: '#3B82F6' },
		{ id: 2, name: 'PRODUCT DESIGN', description: 'Design and UX', members: 8, active: true, color: '#EC4899' },
		{ id: 3, name: 'MARKETING', description: 'Content and growth', members: 6, active: false, color: '#F59E0B' },
		{ id: 4, name: 'SALES', description: 'Sales and BD', members: 15, active: true, color: '#10B981' },
		{ id: 5, name: 'OPERATIONS', description: 'Ops team', members: 4, active: true, color: '#8B5CF6' }
	]);

	let showGroupDialog = $state(false);
	let isEditingGroup = $state(false);
	let editingGroupId: number | null = $state(null);
	let isMobile = $state(false);
	let searchQuery = $state('');

	let defaultColor = $state('#3B82F6');
	let groupForm: any = $state({ name: '', description: '', members: 0, color: '#3B82F6' });

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

	function saveGroup() {
		if (!groupForm.name.trim()) {
			toast.error('Please enter a group name');
			return;
		}

		if (isEditingGroup && editingGroupId != null) {
			groups = groups.map(g => g.id === editingGroupId ? { ...g, name: groupForm.name, description: groupForm.description, members: groupForm.members, color: groupForm.color } : g);
			toast.success(`Group "${groupForm.name}" updated`);
		} else {
			const nextId = groups.length ? Math.max(...groups.map(g => g.id)) + 1 : 1;
			groups = [...groups, { id: nextId, name: groupForm.name, description: groupForm.description, members: groupForm.members, color: groupForm.color, active: true }];
			toast.success(`Group "${groupForm.name}" created`);
		}

		showGroupDialog = false;
	}

	function deleteGroup(id: number) {
		// simple placeholder; confirm
		if (!confirm('Delete this group? This action cannot be undone.')) return;
		groups = groups.filter(g => g.id !== id);
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
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
		<div>
			<h1 class="hidden sm:block text-2xl md:text-3xl lg:text-4xl font-bold">Manage Groups</h1>
			<p class="hidden md:block text-sm text-muted-foreground mt-1">Organize and manage team groups and member assignments</p>
		</div>
		<Button onclick={openAddGroup} class="w-full sm:w-auto">
			<Plus class="mr-2 h-4 w-4" />
			Add Group
		</Button>
	</div>

	<!-- Search -->
	<div class="relative mb-6">
		<Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
		<Input 
			bind:value={searchQuery}
			placeholder="Search groups..."
			class="pl-10 rounded-2xl py-3 max-w-md md:max-w-xl"
		/>
	</div>

	<!-- Stats Cards -->
	<div class="grid gap-4 sm:grid-cols-3 mb-8">
		<Card class="hover:shadow-md transition-shadow">
			<CardContent class="p-6 md:p-8">
				<div class="flex items-end gap-4">
					<div class="p-2 bg-primary/10 rounded-lg">
						<Users class="h-6 w-6 text-primary" />
					</div>
					<div>
						<div class="text-3xl md:text-4xl font-bold">{totalGroups}</div>
						<div class="text-xs md:text-sm text-muted-foreground">Total Groups</div>
					</div>
				</div>
			</CardContent>
		</Card>
		<Card class="hover:shadow-md transition-shadow">
			<CardContent class="p-6 md:p-8">
				<div class="flex items-end gap-4">
					<div class="p-2 bg-primary/10 rounded-lg">
						<Users class="h-6 w-6 text-primary" />
					</div>
					<div>
						<div class="text-3xl md:text-4xl font-bold">{activeGroups}</div>
						<div class="text-xs md:text-sm text-muted-foreground">Active</div>
					</div>
				</div>
			</CardContent>
		</Card>
		<Card class="hover:shadow-md transition-shadow">
			<CardContent class="p-6 md:p-8">
				<div class="flex items-end gap-4">
					<div class="p-2 bg-primary/10 rounded-lg">
						<Users class="h-6 w-6 text-primary" />
					</div>
					<div>
						<div class="text-3xl md:text-4xl font-bold">{totalMembers}</div>
						<div class="text-xs md:text-sm text-muted-foreground">Members</div>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Groups List -->
	<div>
		<div class="mb-6">
			<h2 class="text-xl md:text-2xl font-semibold mb-2">Groups ({filteredGroups.length})</h2>
			<p class="text-sm text-muted-foreground hidden md:block">Manage and organize all team groups</p>
		</div>
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredGroups as group}
				<Card class="hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer overflow-hidden">
					<div class="h-1" style="background-color: {group.color};"></div>
					<CardContent class="p-6">
						<div class="space-y-4">
							<!-- Header -->
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-start gap-3 flex-1">
									<div class="p-2 rounded-lg mt-1 shrink-0" style="background-color: {group.color}20;">
										<Users class="h-5 w-5" style="color: {group.color};" />
									</div>
									<div class="flex-1 min-w-0">
										<h3 class="font-semibold text-base md:text-lg truncate">{group.name}</h3>
										<p class="text-sm text-muted-foreground line-clamp-2 mt-1">{group.description}</p>
									</div>
								</div>
							</div>
							<!-- Members Badge -->
							<div class="flex items-center justify-between pt-3 border-t">
								<div class="px-3 py-1 rounded-full text-xs font-semibold text-white" style="background-color: {group.color};">
									{group.members} members
								</div>
								<div class="flex gap-2">
									<Button variant="ghost" size="sm" class="hover:bg-primary/10" onclick={() => editGroup(group.id)}>
										<Edit class="h-4 w-4" />
									</Button>
									<Button variant="ghost" size="sm" class="hover:bg-destructive/10" onclick={() => deleteGroup(group.id)}>
										<Trash2 class="h-4 w-4 text-destructive" />
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

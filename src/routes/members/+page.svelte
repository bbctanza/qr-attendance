<script lang="ts">
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import * as Select from "$lib/components/ui/select";
    import * as Table from "$lib/components/ui/table";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Badge } from "$lib/components/ui/badge";
    import { Label } from "$lib/components/ui/label";
    import { Search, Plus, MoreHorizontal, FileDown, ArrowLeft, MoreVertical, QrCode, Filter, ChevronLeft, ChevronRight, UserPlus, Lock, X, ArrowUpDown, ArrowUp, ArrowDown } from "@lucide/svelte";
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
        DropdownMenuCheckboxItem,
    } from "$lib/components/ui/dropdown-menu";
    import {
        Drawer,
        DrawerContent,
        DrawerHeader,
        DrawerTitle,
        DrawerTrigger,
        DrawerClose,
    } from "$lib/components/ui/drawer";
    import {
        Sheet,
        SheetContent,
        SheetHeader,
        SheetTitle,
    } from "$lib/components/ui/sheet";

    // Modal state
    let showAddMemberModal = $state(false);
    // Drawer (mobile) state - drawer uses portal so we keep a separate mobile state
    let showAddMemberDrawer = $state(false);
    let formData = $state({
        lastName: "",
        firstName: "",
        middleInitial: "",
        group: ""
    });

    // Mock Data
    let members = $state([
        { id: 1, name: "Mike Ross", email: "mike@example.com", role: "Engineering Lead", group: "ENGINEERING", qrId: "ENG-8821", status: "Active", avatar: "" },
        { id: 2, name: "James Wilson", email: "james@example.com", role: "Backend Dev", group: "ENGINEERING", qrId: "ENG-4192", status: "Active", avatar: "" },
        { id: 3, name: "Sarah Jenkins", email: "sarah@example.com", role: "Product Designer", group: "PRODUCT DESIGN", qrId: "DSG-1029", status: "Active", avatar: "" },
        { id: 4, name: "Emily Chen", email: "emily@example.com", role: "UX Researcher", group: "PRODUCT DESIGN", qrId: "DSG-3391", status: "Active", avatar: "" },
        { id: 5, name: "David Chen", email: "david@example.com", role: "Specialist", group: "MARKETING", qrId: "MKT-1102", status: "Active", avatar: "" },
    ]);

    const groupOptions = ["ENGINEERING", "PRODUCT DESIGN", "MARKETING"];

    const groupItems = groupOptions.map(group => ({
        value: group,
        label: group
    }));

    const groupTriggerContent = $derived(
        groupItems.find((g) => g.value === formData.group)?.label ?? "Select Group..."
    );

    let searchQuery = $state("");

    // Group filter state
    let selectedGroups = $state(new Set(groupOptions));

    // Sort state
    let sortColumn = $state("name");
    let sortDirection = $state<"asc" | "desc">("asc");

    let filteredMembers = $derived(() => {
        let filtered = members.filter(m => 
            (m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
            m.group.toLowerCase().includes(searchQuery.toLowerCase())) &&
            selectedGroups.has(m.group)
        );

        // Sort the filtered results
        return filtered.sort((a, b) => {
            let aValue: string | number;
            let bValue: string | number;

            switch (sortColumn) {
                case "name":
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
                    break;
                case "group":
                    aValue = a.group.toLowerCase();
                    bValue = b.group.toLowerCase();
                    break;
                case "id":
                    aValue = a.qrId.toLowerCase();
                    bValue = b.qrId.toLowerCase();
                    break;
                case "status":
                    aValue = a.status.toLowerCase();
                    bValue = b.status.toLowerCase();
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
            if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });
    });

    // Group members by their group
    let groupedMembers = $derived(() => {
        const groups: Record<string, typeof members> = {};
        filteredMembers().forEach(m => {
            if (!groups[m.group]) groups[m.group] = [];
            groups[m.group].push(m);
        });
        return groups;
    });

    const groupColors: Record<string, string> = {
        "ENGINEERING": "border-primary",
        "PRODUCT DESIGN": "border-orange-500",
        "MARKETING": "border-purple-500"
    };

    async function handleAddMember() {
        // Validate form
        if (!formData.lastName || !formData.firstName || !formData.group) {
            alert("Please fill in all required fields");
            return;
        }

        // Generate QR ID based on group
        const groupCode = formData.group === "ENGINEERING" ? "ENG" : 
                         formData.group === "PRODUCT DESIGN" ? "DSG" : "MKT";
        const newId = Math.floor(Math.random() * 9000) + 1000;
        const qrId = `${groupCode}-${newId}`;

        // Add new member
        const newMember = {
            id: members.length + 1,
            name: `${formData.firstName} ${formData.lastName}`,
            email: "",
            role: "",
            group: formData.group,
            qrId: qrId,
            status: "Active",
            avatar: ""
        };

        members = [...members, newMember];

        // Reset form and close modal/drawer
        formData = {
            lastName: "",
            firstName: "",
            middleInitial: "",
            group: ""
        };
        showAddMemberModal = false;
        showAddMemberDrawer = false;
    }

    function handleMiddleInitialChange(e: Event) {
        const input = e.target as HTMLInputElement;
        formData.middleInitial = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);
    }

    function getInitials(name: string) {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    function handleSort(column: string) {
        if (sortColumn === column) {
            sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
            sortColumn = column;
            sortDirection = "asc";
        }
    }
</script>

<!-- Mobile View -->
<div class="md:hidden flex flex-col min-h-screen bg-background pb-20 mt-2">

    <!-- Search & Add -->
    <div class="px-4 py-2 flex items-center gap-3">
        <div class="relative flex-1">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground-mobile" size={20} />
            <input 
                type="text" 
                placeholder="Search members..." 
                bind:value={searchQuery}
                class="w-full bg-card/20 border-2 border-border/20 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:border-primary ring-primary/20 outline-none placeholder-muted-foreground-mobile"
            />
        </div>
        <button aria-label="Add member" onclick={() => showAddMemberDrawer = true} class="bg-primary aspect-square h-14 flex items-center justify-center rounded-[22px] shadow-lg shadow-primary/10 active:scale-95 transition-all">
            <UserPlus size={26} class="text-primary-foreground" />
        </button>
    </div>

    <!-- Stats & Filter -->
    <div class="px-4 py-6 flex items-end justify-between">
        <div>
            <span class="text-[10px] font-black tracking-[0.15em] text-muted-foreground/60 uppercase">Total Members</span>
            <div class="flex items-baseline gap-2 mt-1">
                <span class="text-4xl font-black tracking-tight">{members.length}</span>
                <span class="text-[13px] font-bold" style="color: var(--stat-accent)">+12 this week</span>
            </div>
        </div>
        <button class="flex items-center gap-2 bg-card/40 border border-border/10 px-5 py-3 rounded-2xl text-sm font-bold text-muted-foreground/80 active:scale-95 transition-all">
            <Filter size={18} />
            <span>Filter</span>
        </button>
    </div>

    <!-- Grouped List -->
    <div class="flex-1 px-4 py-4 space-y-8">
        {#each Object.entries(groupedMembers()) as [groupName, groupMembers]}
            <section>
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-1 h-4 rounded-full {groupColors[groupName] || 'bg-muted'} border-l-4"></div>
                    <h2 class="text-xs font-bold tracking-wider text-muted-foreground uppercase">{groupName}</h2>
                    <span class="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground/70">{groupMembers.length}</span>
                </div>

                <div class="space-y-3">
                    {#each groupMembers as member}
                        <div class="bg-card/40 border border-border/40 rounded-2xl p-4 flex items-center justify-between group active:scale-[0.98] transition-all">
                            <div class="flex items-center gap-4">
                                <div class="relative">
                                    {#if member.avatar}
                                        <img src={member.avatar} alt={member.name} class="w-12 h-12 rounded-2xl object-cover" />
                                    {:else}
                                        <div class="w-12 h-12 rounded-2xl bg-linear-to-br from-primary/10 to-primary/30 flex items-center justify-center text-primary font-bold text-lg border border-primary/20">
                                            {getInitials(member.name)}
                                        </div>
                                    {/if}
                                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-background rounded-full flex items-center justify-center">
                                        <div class="w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background"></div>
                                    </div>
                                </div>
                                
                                <div class="min-w-0">
                                    <h3 class="font-bold text-foreground leading-tight truncate">{member.name}</h3>
                                    <div class="flex items-center gap-2 mt-0.5">

                                        <span class="text-[10px] text-primary font-mono bg-primary/5 px-1.5 py-0.5 rounded shrink-0">{member.qrId}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <button class="p-2 text-muted-foreground hover:text-foreground active:scale-90 transition-transform">
                                <QrCode size={18} />
                            </button>
                        </div>
                    {/each}
                </div>
            </section>
        {:else}
            <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 opacity-20">
                    <Search size={32} />
                </div>
                <p>No members found matching "{searchQuery}"</p>
            </div>
        {/each}
    </div>
</div>

<!-- Desktop View -->
<div class="hidden md:flex flex-col gap-4 p-4 lg:p-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
        <div>
            <h2 class="text-3xl font-bold tracking-tight">Member</h2>
            <p class="text-muted-foreground">Manage your congregation and attendees.</p>
        </div>
        <div class="flex gap-2">
            <Button variant="outline" size="sm" class="hidden sm:flex">
                <FileDown class="mr-2 h-4 w-4" /> Export
            </Button>
            <Button size="sm" onclick={() => showAddMemberModal = true}>
                <Plus class="mr-2 h-4 w-4" /> Add Member
            </Button>
        </div>
    </div>

    <div class="flex items-center py-4 gap-4">
        <div class="relative w-full max-w-sm">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Search members..."
                class="pl-8 border-2 border-border/20 rounded-xl focus:ring-2 focus:border-primary ring-primary/20"
                bind:value={searchQuery}
            />
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger>
                <Button variant="outline" size="sm" class="h-10">
                    <Filter class="mr-2 h-4 w-4" />
                    Groups
                    <ChevronRight class="ml-2 h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
                <DropdownMenuLabel>Filter by Group</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {#each groupOptions as group}
                    <DropdownMenuCheckboxItem
                        checked={selectedGroups.has(group)}
                        onchange={(checked) => {
                            if (checked) {
                                selectedGroups.add(group);
                            } else {
                                selectedGroups.delete(group);
                            }
                            selectedGroups = new Set(selectedGroups);
                        }}
                    >
                        {group}
                    </DropdownMenuCheckboxItem>
                {/each}
            </DropdownMenuContent>
        </DropdownMenu>
    </div>

    <div class="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head class="w-12.5"></Table.Head>
                    <Table.Head>
                        <Button variant="ghost" class="h-auto p-0 font-medium hover:bg-transparent" onclick={() => handleSort("name")}>
                            Name
                            {#if sortColumn === "name"}
                                {#if sortDirection === "asc"}
                                    <ArrowUp class="ml-2 h-4 w-4" />
                                {:else}
                                    <ArrowDown class="ml-2 h-4 w-4" />
                                {/if}
                            {:else}
                                <ArrowUpDown class="ml-2 h-4 w-4" />
                            {/if}
                        </Button>
                    </Table.Head>
                    <Table.Head>
                        <Button variant="ghost" class="h-auto p-0 font-medium hover:bg-transparent" onclick={() => handleSort("group")}>
                            Group
                            {#if sortColumn === "group"}
                                {#if sortDirection === "asc"}
                                    <ArrowUp class="ml-2 h-4 w-4" />
                                {:else}
                                    <ArrowDown class="ml-2 h-4 w-4" />
                                {/if}
                            {:else}
                                <ArrowUpDown class="ml-2 h-4 w-4" />
                            {/if}
                        </Button>
                    </Table.Head>
                    <Table.Head>
                        <Button variant="ghost" class="h-auto p-0 font-medium hover:bg-transparent" onclick={() => handleSort("id")}>
                            ID
                            {#if sortColumn === "id"}
                                {#if sortDirection === "asc"}
                                    <ArrowUp class="ml-2 h-4 w-4" />
                                {:else}
                                    <ArrowDown class="ml-2 h-4 w-4" />
                                {/if}
                            {:else}
                                <ArrowUpDown class="ml-2 h-4 w-4" />
                            {/if}
                        </Button>
                    </Table.Head>
                    <Table.Head>
                        <Button variant="ghost" class="h-auto p-0 font-medium hover:bg-transparent" onclick={() => handleSort("status")}>
                            Status
                            {#if sortColumn === "status"}
                                {#if sortDirection === "asc"}
                                    <ArrowUp class="ml-2 h-4 w-4" />
                                {:else}
                                    <ArrowDown class="ml-2 h-4 w-4" />
                                {/if}
                            {:else}
                                <ArrowUpDown class="ml-2 h-4 w-4" />
                            {/if}
                        </Button>
                    </Table.Head>
                    <Table.Head class="text-right">Actions</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {#if filteredMembers().length === 0}
                    <Table.Row>
                        <Table.Cell colspan={6} class="h-24 text-center">
                            No members found.
                        </Table.Cell>
                    </Table.Row>
                {:else}
                    {#each filteredMembers() as member (member.id)}
                        <Table.Row>
                            <Table.Cell>
                                <Avatar class="h-8 w-8">
                                    <AvatarImage src={member.avatar} alt={member.name} />
                                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                                </Avatar>
                            </Table.Cell>
                            <Table.Cell class="font-medium">{member.name}</Table.Cell>
                            <Table.Cell>
                                <div class="flex items-center gap-1.5">
                                    <div class="w-1.5 h-3 rounded-full {groupColors[member.group] || 'bg-muted'} border-l-2"></div>
                                    <span class="text-xs font-semibold">{member.group}</span>
                                </div>
                            </Table.Cell>
                            <Table.Cell>
                                <code class="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">{member.qrId}</code>
                            </Table.Cell>
                            <Table.Cell>
                                {#if member.status === 'Active'}
                                    <Badge class="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">Active</Badge>
                                {:else}
                                    <Badge variant="secondary">Inactive</Badge>
                                {/if}
                            </Table.Cell>
                            <Table.Cell class="text-right">
                                <DropdownMenu>
                                    <DropdownMenuTrigger>
                                        {#snippet child({ props })}
                                            <Button {...props} variant="ghost" size="icon" class="h-8 w-8 p-0">
                                                <span class="sr-only">Open menu</span>
                                                <MoreHorizontal class="h-4 w-4" />
                                            </Button>
                                        {/snippet}
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                        <DropdownMenuItem>View details</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem>Edit member</DropdownMenuItem>
                                        <DropdownMenuItem class="text-red-500">Delete member</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                {/if}
            </Table.Body>
        </Table.Root>
    </div>
</div>

<!-- Add Member Modal - Desktop -->
<div class="hidden md:block">
    <Sheet bind:open={showAddMemberModal}>
        <SheetContent class="sm:max-w-md">
            <SheetHeader>
                <SheetTitle class="flex items-center gap-3">
                    <div class="p-2 bg-primary/10 rounded-lg">
                        <UserPlus size={20} class="text-primary" />
                    </div>
                    ADD MEMBER
                </SheetTitle>
            </SheetHeader>

            <div class="px-4 pb-4">
                <p class="text-sm text-muted-foreground mb-6">Enter details to generate a unique QR ID.</p>

                <!-- Form Fields -->
                <div class="space-y-5">
                    <!-- Last Name -->
                    <div>
                        <Label for="lastName" class="text-xs font-bold tracking-wider uppercase">Last Name</Label>
                        <Input
                            id="lastName"
                            type="text"
                            placeholder="e.g. Doe"
                            bind:value={formData.lastName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- First Name -->
                    <div>
                        <Label for="firstName" class="text-xs font-bold tracking-wider uppercase">First Name</Label>
                        <Input
                            id="firstName"
                            type="text"
                            placeholder="e.g. John"
                            bind:value={formData.firstName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- Middle Initial & Group -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <Label for="middleInitial" class="text-xs font-bold tracking-wider uppercase">M.I.</Label>
                            <Input
                                id="middleInitial"
                                type="text"
                                placeholder="A"
                                value={formData.middleInitial}
                                onchange={handleMiddleInitialChange}
                                class="mt-2 rounded-xl py-3 text-center font-bold placeholder-muted-foreground-mobile border-input"
                            />
                        </div>
                        <div>
                            <Label for="groupSelect" class="text-xs font-bold tracking-wider uppercase">Group</Label>
                            <div class="mt-2">
                                <Select.Root type="single" bind:value={formData.group}>
                                    <Select.Trigger id="groupSelect" class="w-full h-12 rounded-xl px-4 font-medium flex items-center justify-between">
                                        {groupTriggerContent}
                                    </Select.Trigger>
                                    <Select.Content class="bg-popover border-border/40 rounded-xl">
                                        <Select.Group>
                                            <Select.Label class="text-xs font-bold tracking-wider uppercase px-2 py-1.5 text-muted-foreground/60">Groups</Select.Label>
                                            {#each groupItems as group}
                                                <Select.Item
                                                    value={group.value}
                                                    label={group.label}
                                                    class="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                                >
                                                    {group.label}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-3 mt-8">
                        <Button
                            size="lg"
                            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base"
                            onclick={handleAddMember}
                        >
                            SAVE MEMBER <ChevronRight size={18} class="ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </SheetContent>
    </Sheet>
</div>

<!-- Add Member Drawer - Mobile -->
<div class="md:hidden">
    <Drawer bind:open={showAddMemberDrawer}>
        <DrawerContent>
            <DrawerHeader class="flex flex-row items-center justify-between">
                <DrawerTitle class="flex items-center gap-3">
                    <div class="p-2 bg-primary/10 rounded-lg">
                        <UserPlus size={20} class="text-primary" />
                    </div>
                    ADD MEMBER
                </DrawerTitle>
                <DrawerClose>
                    <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
                        <X class="h-4 w-4" />
                    </Button>
                </DrawerClose>
            </DrawerHeader>

            <div class="px-4 pb-4">
                <p class="text-sm text-muted-foreground mb-6">Enter details to generate a unique QR ID.</p>

                <!-- Form Fields -->
                <div class="space-y-5">
                    <!-- Last Name -->
                    <div>
                        <Label for="lastNameMobile" class="text-xs font-bold tracking-wider uppercase">Last Name</Label>
                        <Input
                            id="lastNameMobile"
                            type="text"
                            placeholder="e.g. Doe"
                            bind:value={formData.lastName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- First Name -->
                    <div>
                        <Label for="firstNameMobile" class="text-xs font-bold tracking-wider uppercase">First Name</Label>
                        <Input
                            id="firstNameMobile"
                            type="text"
                            placeholder="e.g. John"
                            bind:value={formData.firstName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- Middle Initial & Group -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <Label for="middleInitialMobile" class="text-xs font-bold tracking-wider uppercase">M.I.</Label>
                            <Input
                                id="middleInitialMobile"
                                type="text"
                                placeholder="A"
                                value={formData.middleInitial}
                                onchange={handleMiddleInitialChange}
                                class="mt-2 rounded-xl py-3 text-center font-bold placeholder-muted-foreground-mobile border-input"
                            />
                        </div>
                        <div>
                            <Label for="groupSelectMobile" class="text-xs font-bold tracking-wider uppercase">Group</Label>
                            <div class="mt-2">
                                <Select.Root type="single" bind:value={formData.group}>
                                    <Select.Trigger id="groupSelectMobile" class="w-full h-12 rounded-xl px-4 font-medium flex items-center justify-between">
                                        {groupTriggerContent}
                                    </Select.Trigger>
                                    <Select.Content class="bg-popover border-border/40 rounded-xl">
                                        <Select.Group>
                                            <Select.Label class="text-xs font-bold tracking-wider uppercase px-2 py-1.5 text-muted-foreground/60">Groups</Select.Label>
                                            {#each groupItems as group}
                                                <Select.Item
                                                    value={group.value}
                                                    label={group.label}
                                                    class="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                                >
                                                    {group.label}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-3 mt-8">
                        <Button
                            size="lg"
                            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base"
                            onclick={handleAddMember}
                        >
                            SAVE MEMBER <ChevronRight size={18} class="ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </DrawerContent>
    </Drawer>
</div>

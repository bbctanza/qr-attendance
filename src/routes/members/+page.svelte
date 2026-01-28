<script lang="ts">
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import * as Table from "$lib/components/ui/table";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Badge } from "$lib/components/ui/badge";
    import { Search, Plus, MoreHorizontal, FileDown, ArrowLeft, MoreVertical, QrCode, Filter, ChevronLeft, ChevronRight, UserPlus } from "@lucide/svelte";
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
    } from "$lib/components/ui/dropdown-menu";

    // Mock Data
    let members = [
        { id: 1, name: "Mike Ross", email: "mike@example.com", role: "Engineering Lead", group: "ENGINEERING", qrId: "ENG-8821", status: "Active", avatar: "" },
        { id: 2, name: "James Wilson", email: "james@example.com", role: "Backend Dev", group: "ENGINEERING", qrId: "ENG-4192", status: "Active", avatar: "" },
        { id: 3, name: "Sarah Jenkins", email: "sarah@example.com", role: "Product Designer", group: "PRODUCT DESIGN", qrId: "DSG-1029", status: "Active", avatar: "" },
        { id: 4, name: "Emily Chen", email: "emily@example.com", role: "UX Researcher", group: "PRODUCT DESIGN", qrId: "DSG-3391", status: "Active", avatar: "" },
        { id: 5, name: "David Chen", email: "david@example.com", role: "Specialist", group: "MARKETING", qrId: "MKT-1102", status: "Active", avatar: "" },
    ];

    let searchQuery = $state("");

    let filteredMembers = $derived(
        members.filter(m => 
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
            m.group.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    // Group members by their group
    let groupedMembers = $derived.by(() => {
        const groups: Record<string, typeof members> = {};
        filteredMembers.forEach(m => {
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

    function getInitials(name: string) {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
</script>

<!-- Mobile View -->
<div class="md:hidden flex flex-col min-h-screen bg-background pb-20 mt-2">

    <!-- Search & Add -->
    <div class="px-4 py-2 flex items-center gap-3">
        <div class="relative flex-1">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={20} />
            <input 
                type="text" 
                placeholder="Search members..." 
                bind:value={searchQuery}
                class="w-full bg-card/20 border border-border/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 ring-primary/20 outline-none placeholder:text-muted-foreground/30"
            />
        </div>
        <button class="bg-primary aspect-square h-14 flex items-center justify-center rounded-[22px] shadow-lg shadow-primary/10 active:scale-95 transition-all">
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
        {#each Object.entries(groupedMembers) as [groupName, groupMembers]}
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
            <Button size="sm">
                <Plus class="mr-2 h-4 w-4" /> Add Member
            </Button>
        </div>
    </div>

    <div class="flex items-center py-4">
        <div class="relative w-full max-w-sm">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Search members..."
                class="pl-8"
                bind:value={searchQuery}
            />
        </div>
    </div>

    <div class="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head class="w-12.5"></Table.Head>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>Group</Table.Head>
                    <Table.Head>ID</Table.Head>
                    <Table.Head>Status</Table.Head>
                    <Table.Head class="text-right">Actions</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {#if filteredMembers.length === 0}
                    <Table.Row>
                        <Table.Cell colspan={6} class="h-24 text-center">
                            No members found.
                        </Table.Cell>
                    </Table.Row>
                {:else}
                    {#each filteredMembers as member (member.id)}
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


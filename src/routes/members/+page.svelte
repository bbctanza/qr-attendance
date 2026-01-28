<script lang="ts">
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import * as Table from "$lib/components/ui/table";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Badge } from "$lib/components/ui/badge";
    import { Search, Plus, MoreHorizontal, FileDown } from "@lucide/svelte";
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
        { id: 1, name: "Alice Johnson", email: "alice@example.com", role: "Leader", status: "Active", avatar: "" },
        { id: 2, name: "Bob Smith", email: "bob@example.com", role: "Member", status: "Active", avatar: "" },
        { id: 3, name: "Charlie Brown", email: "charlie@example.com", role: "Member", status: "Inactive", avatar: "" },
        { id: 4, name: "Diana Prince", email: "diana@example.com", role: "Volunteer", status: "Active", avatar: "" },
        { id: 5, name: "Evan Wright", email: "evan@example.com", role: "Youth", status: "Active", avatar: "" },
    ];

    let searchQuery = "";

    $: filteredMembers = members.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    function getInitials(name: string) {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
</script>

<!-- Mobile View -->
<div class="flex flex-col gap-4 p-4 md:hidden pb-28">
    <div class="flex flex-col gap-2">
        <h2 class="text-2xl font-bold tracking-tight">Members</h2>
        <p class="text-xs text-muted-foreground">Manage your congregation and attendees.</p>
    </div>

    <div class="flex items-center gap-2">
        <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
                type="search"
                placeholder="Search"
                class="w-full bg-card border border-border/40 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                bind:value={searchQuery}
            />
        </div>
        <Button size="icon" class="rounded-2xl bg-primary text-primary-foreground h-12 w-12 shadow-lg shadow-primary/10">
            <Plus class="h-5 w-5" />
        </Button>
    </div>

    <div class="space-y-3">
        {#each filteredMembers as member (member.id)}
            <div class="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border/40 shadow-sm active:scale-[0.99] transition-all">
                <Avatar class="h-12 w-12 rounded-2xl">
                    <AvatarImage src={member.avatar} alt={member.name} />
                    <AvatarFallback class="rounded-2xl bg-primary/10 text-primary font-bold">{getInitials(member.name)}</AvatarFallback>
                </Avatar>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <div class="text-sm font-bold leading-tight">{member.name}</div>
                        <Badge variant="outline" class="shrink-0 text-[10px] h-5 px-1.5 uppercase font-black tracking-widest {member.status === 'Active' ? 'text-primary border-primary/20 bg-primary/5' : 'text-muted-foreground/60'}">
                            {member.status}
                        </Badge>
                    </div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-widest font-black mt-0.5">{member.role}</div>
                </div>
            </div>
        {/each}
        
        {#if filteredMembers.length === 0}
            <div class="py-12 text-center text-muted-foreground">
                <p>No members found</p>
            </div>
        {/if}
    </div>
</div>

<!-- Desktop View -->
<div class="hidden md:flex flex-col gap-4 p-4 lg:p-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
        <div>
            <h2 class="text-3xl font-bold tracking-tight">Members</h2>
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
                    <Table.Head class="hidden md:table-cell">Email</Table.Head>
                    <Table.Head>Role</Table.Head>
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
                            <Table.Cell class="hidden md:table-cell text-muted-foreground">{member.email}</Table.Cell>
                            <Table.Cell>
                                <Badge variant="outline">{member.role}</Badge>
                            </Table.Cell>
                            <Table.Cell>
                                {#if member.status === 'Active'}
                                    <Badge class="bg-green-500/15 text-green-600 hover:bg-green-500/25 border-green-200">Active</Badge>
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


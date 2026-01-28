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

<div class="flex flex-col gap-4 p-4 lg:p-6">
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
                    <Table.Head class="w-[50px]"></Table.Head>
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
                                    <DropdownMenuTrigger asChild let:builder>
                                        <Button variant="ghost" builders={[builder]} size="icon" class="h-8 w-8 p-0">
                                            <span class="sr-only">Open menu</span>
                                            <MoreHorizontal class="h-4 w-4" />
                                        </Button>
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

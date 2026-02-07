<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import * as Select from "$lib/components/ui/select";
    import * as AlertDialog from "$lib/components/ui/alert-dialog";
    import { ChevronLeft, Mail, ShieldCheck, Lock, Send, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Users, UserMinus, RefreshCw } from '@lucide/svelte';
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Badge } from "$lib/components/ui/badge";
    import { goto } from '$app/navigation';
    import { supabase } from '$lib/supabase';
    import { onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import FullPageLoading from '$lib/components/full-page-loading.svelte';

    let activeTab = $state("invite"); // "invite" or "manage"
    let inviteEmail = $state("");
    let inviteRole = $state("staff");
    let adminPassword = $state("");
    let showPassword = $state(false);
    let isLoading = $state(false);
    let adminProfile = $state<any>(null);
    let pageLoading = $state(true);

    // Management State
    let staffUsers = $state<any[]>([]);
    let isFetchingUsers = $state(false);
    let isDeleteDialogOpen = $state(false);
    let isRoleUpdateOpen = $state(false);
    let userToDelete = $state<any>(null);
    let roleUpdateData = $state<{userId: string, newRole: string} | null>(null);

    const roles = [
        { value: "admin", label: "Administrator" },
        { value: "staff", label: "Staff" },
        { value: "guest", label: "Guest" },
        { value: "developer", label: "Developer" }
    ];

    onMount(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                goto('/');
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (!profile || (profile.role !== 'admin' && profile.role !== 'developer')) {
                toast.error("Unauthorized access");
                goto('/settings');
                return;
            }
            adminProfile = profile;
        } catch (e) {
            console.error(e);
            goto('/settings');
        } finally {
            pageLoading = false;
        }
    });

    async function fetchUsers() {
        isFetchingUsers = true;
        try {
            const { data, error } = await supabase.functions.invoke('invitation-service', {
                body: { action: 'list-users' }
            });
            if (error) throw error;
            staffUsers = data.users || [];
        } catch (e: any) {
            toast.error(e.message || "Failed to fetch users");
        } finally {
            isFetchingUsers = false;
        }
    }

    $effect(() => {
        if (activeTab === 'manage' && staffUsers.length === 0) {
            fetchUsers().catch(console.error);
        }
    });

    async function handleUpdateRole(userId: string, newRole: string) {
        adminPassword = ""; // Clear for modal
        roleUpdateData = { userId, newRole };
        isRoleUpdateOpen = true;
    }

    async function confirmRoleUpdate() {
        if (!roleUpdateData || !adminPassword) {
            toast.error("Password is required");
            return;
        }
        
        try {
            const { error } = await supabase.functions.invoke('invitation-service', {
                body: { 
                    action: 'update-role',
                    userId: roleUpdateData.userId,
                    newRole: roleUpdateData.newRole,
                    password: adminPassword
                }
            });
            if (error) throw error;
            toast.success("Role updated successfully");
            await fetchUsers();
            isRoleUpdateOpen = false;
        } catch (e: any) {
            toast.error(e.message || "Failed to update role");
        } finally {
            roleUpdateData = null;
        }
    }

    async function handleDeleteUser(userId: string) {
        adminPassword = ""; // Clear for modal
        userToDelete = staffUsers.find(u => u.id === userId);
        isDeleteDialogOpen = true;
    }

    async function confirmDelete() {
        if (!userToDelete || !adminPassword) {
            toast.error("Password is required");
            return;
        }

        try {
            const { error } = await supabase.functions.invoke('invitation-service', {
                body: { 
                    action: 'delete-user',
                    userId: userToDelete.id,
                    password: adminPassword
                }
            });
            if (error) throw error;
            toast.success("User removed from system");
            await fetchUsers();
            isDeleteDialogOpen = false;
        } catch (e: any) {
            toast.error(e.message || "Failed to delete user");
        } finally {
            userToDelete = null;
        }
    }

    async function handleSendInvite() {
        if (!inviteEmail || !adminPassword) {
            toast.error("Please fill in all fields");
            return;
        }

        isLoading = true;
        try {
            // Use Supabase Edge Function to verify password and send invite
            const { data, error } = await supabase.functions.invoke('invitation-service', {
                body: {
                    action: 'send-invite',
                    password: adminPassword,
                    inviteEmail: inviteEmail,
                    inviteRole: inviteRole
                }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast.success("Invitation sent successfully!");
            inviteEmail = "";
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Failed to send invitation");
        } finally {
            isLoading = false;
        }
    }
</script>

{#if pageLoading}
    <FullPageLoading message="Verifying permissions..." />
{:else}
<div class="flex flex-col gap-6 p-4 md:px-8 md:py-6 lg:px-12 lg:py-8 max-w-3xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div class="flex items-center gap-4">
            <Button variant="ghost" size="icon" onclick={() => goto('/settings')} class="rounded-xl shrink-0">
                <ChevronLeft class="h-5 w-5" />
            </Button>
            <div class="min-w-0">
                <h1 class="text-2xl md:text-3xl font-bold truncate">Administration</h1>
                <p class="text-muted-foreground text-sm md:text-base mt-1">Manage System Access</p>
            </div>
        </div>

        <div class="flex bg-muted p-1 rounded-xl w-full sm:w-auto">
            <button 
                class="flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all {activeTab === 'invite' ? 'bg-background shadow-sm' : 'text-muted-foreground'}"
                onclick={() => activeTab = 'invite'}
            >
                Invite
            </button>
            <button 
                class="flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all {activeTab === 'manage' ? 'bg-background shadow-sm' : 'text-muted-foreground'}"
                onclick={() => activeTab = 'manage'}
            >
                Staff List
            </button>
        </div>
    </div>

    <div class="space-y-6">
        {#if activeTab === 'invite'}
            <!-- Step 1: Basic Info -->
            <div class="rounded-2xl border border-border/30 bg-card p-6 space-y-4">
                <div class="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-widest mb-2">
                    <Mail class="h-4 w-4" /> 1. Invitation Details
                </div>
                
                <div class="space-y-2">
                    <Label for="email">Invitee Email Address</Label>
                    <Input 
                        id="email" 
                        type="email" 
                        placeholder="name@example.com" 
                        bind:value={inviteEmail} 
                    />
                </div>

                <div class="space-y-2">
                    <Label for="role">Assign Role</Label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {#each roles.filter(r => r.value !== 'developer') as role}
                            <button 
                                class="py-2 px-3 text-xs font-bold rounded-xl border transition-all {inviteRole === role.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted border-border/40'}"
                                onclick={() => inviteRole = role.value}
                            >
                                {role.label}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>

            <!-- Step 2: Authentication -->
            <div class="rounded-2xl border border-border/30 bg-card p-6 space-y-4">
                <div class="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-widest mb-2">
                    <Lock class="h-4 w-4" /> 2. Security Verification
                </div>

                <div class="space-y-2">
                    <Label for="password">Your Password</Label>
                    <div class="relative">
                        <Input 
                            id="password" 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Enter your current password" 
                            bind:value={adminPassword}
                            class="pr-10"
                        />
                        <button 
                            type="button"
                            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            onclick={() => showPassword = !showPassword}
                        >
                            {#if showPassword}
                                <EyeOff class="h-4 w-4" />
                            {:else}
                                <Eye class="h-4 w-4" />
                            {/if}
                        </button>
                    </div>
                    <p class="text-[10px] text-muted-foreground italic">Required to prevent unauthorized accounts from sending invites.</p>
                </div>

                <Button 
                    class="w-full h-12 rounded-xl font-bold" 
                    onclick={handleSendInvite}
                    disabled={isLoading || !inviteEmail || !adminPassword}
                >
                    {#if isLoading}
                        <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                    {:else}
                        <Send class="mr-2 h-4 w-4" />
                        Send Invitation
                    {/if}
                </Button>
            </div>

            <div class="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border border-border/10">
                <AlertCircle class="h-5 w-5 text-muted-foreground shrink-0" />
                <p class="text-xs text-muted-foreground leading-relaxed font-medium">The invitee will receive an email directly from Supabase to set up their account. This invitation bypasses 2FA for convenience.</p>
            </div>
        {:else}
            <!-- Manage Users View -->
            <div class="rounded-2xl border border-border/30 bg-card overflow-hidden">
                <div class="px-6 py-4 border-b border-border/30 bg-muted/20 flex justify-between items-center">
                    <div class="flex items-center gap-2 font-bold text-sm text-primary uppercase tracking-widest">
                        <Users class="h-4 w-4" /> Staff List
                    </div>
                    <Button variant="ghost" size="icon" onclick={fetchUsers} disabled={isFetchingUsers}>
                        <RefreshCw class="h-4 w-4 {isFetchingUsers ? 'animate-spin' : ''}" />
                    </Button>
                </div>

                <div class="divide-y divide-border/30">
                    {#if isFetchingUsers}
                        <div class="p-12 flex flex-col items-center justify-center gap-4">
                            <Loader2 class="h-8 w-8 animate-spin text-primary" />
                            <p class="text-sm text-muted-foreground">Loading staff members...</p>
                        </div>
                    {:else if staffUsers.length === 0}
                        <div class="p-12 text-center text-muted-foreground">No staff members found.</div>
                    {:else}
                        {#each staffUsers as staff}
                            <div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                                <div class="flex items-center gap-4 min-w-0 flex-1">
                                    <Avatar class="h-10 w-10 border border-border/30">
                                        <AvatarImage src={staff.avatar_url} />
                                        <AvatarFallback>{staff.full_name?.charAt(0) || '?'}</AvatarFallback>
                                    </Avatar>
                                    <div class="min-w-0 flex-1">
                                        <div class="font-bold text-sm truncate">{staff.full_name || 'Anonymous User'}</div>
                                        <div class="text-[10px] text-muted-foreground truncate italic">{staff.email}</div>
                                    </div>
                                    <Badge variant="outline" class="text-[9px] uppercase tracking-tighter h-5 px-1.5">{staff.role}</Badge>
                                </div>

                                <div class="flex items-center gap-2">
                                    <Select.Root 
                                        type="single" 
                                        value={staff.role} 
                                        disabled={staff.role === 'developer'}
                                        onValueChange={(v) => handleUpdateRole(staff.id, v)}
                                    >
                                        <Select.Trigger class="h-8 w-28 text-xs font-bold rounded-lg px-2">
                                            {staff.role.charAt(0).toUpperCase() + staff.role.slice(1)}
                                        </Select.Trigger>
                                        <Select.Content class="rounded-xl border border-border/30 shadow-xl">
                                            {#each roles.filter(r => r.value !== 'developer') as r}
                                                <Select.Item value={r.value} class="text-xs font-bold py-2 rounded-lg">
                                                    {r.label}
                                                </Select.Item>
                                            {/each}
                                        </Select.Content>
                                    </Select.Root>

                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        class="h-8 w-8 text-red-500 hover:bg-red-500/10 hover:text-red-600 rounded-lg"
                                        onclick={() => handleDeleteUser(staff.id)}
                                        disabled={staff.id === adminProfile.id || staff.role === 'developer'}
                                    >
                                        <UserMinus class="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>
{/if}

<AlertDialog.Root bind:open={isDeleteDialogOpen}>
    <AlertDialog.Content class="rounded-2xl">
        <AlertDialog.Header>
            <AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
            <AlertDialog.Description>
                This will permanently delete <span class="font-bold text-foreground">{userToDelete?.full_name || userToDelete?.email || 'this user'}</span>. 
                Enter your password to confirm this action.
            </AlertDialog.Description>
        </AlertDialog.Header>
        
        <div class="py-4 space-y-2">
            <Label for="del-password">Your Password</Label>
            <div class="relative">
                <Input 
                    id="del-password"
                    type={showPassword ? "text" : "password"} 
                    placeholder="Confirm your password" 
                    bind:value={adminPassword}
                    class="pr-10 rounded-xl"
                />
                <button 
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onclick={() => showPassword = !showPassword}
                >
                    {#if showPassword}
                        <EyeOff class="h-4 w-4" />
                    {:else}
                        <Eye class="h-4 w-4" />
                    {/if}
                </button>
            </div>
        </div>

        <AlertDialog.Footer>
            <AlertDialog.Cancel class="rounded-xl">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action 
                onclick={confirmDelete}
                class="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
                Permanently Delete
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={isRoleUpdateOpen}>
    <AlertDialog.Content class="rounded-2xl">
        <AlertDialog.Header>
            <AlertDialog.Title>Confirm Role Change</AlertDialog.Title>
            <AlertDialog.Description>
                Are you sure you want to change this user's role to <span class="font-bold text-foreground uppercase">{roleUpdateData?.newRole}</span>? 
                Enter your password to confirm.
            </AlertDialog.Description>
        </AlertDialog.Header>

        <div class="py-4 space-y-2">
            <Label for="role-password">Your Password</Label>
            <div class="relative">
                <Input 
                    id="role-password"
                    type={showPassword ? "text" : "password"} 
                    placeholder="Confirm your password" 
                    bind:value={adminPassword}
                    class="pr-10 rounded-xl"
                />
                <button 
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onclick={() => showPassword = !showPassword}
                >
                    {#if showPassword}
                        <EyeOff class="h-4 w-4" />
                    {:else}
                        <Eye class="h-4 w-4" />
                    {/if}
                </button>
            </div>
        </div>

        <AlertDialog.Footer>
            <AlertDialog.Cancel class="rounded-xl">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action 
                onclick={confirmRoleUpdate}
                class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
            >
                Confirm Change
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

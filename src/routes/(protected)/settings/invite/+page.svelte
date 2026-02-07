<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import * as Select from "$lib/components/ui/select";
    import { ChevronLeft, Mail, ShieldCheck, Lock, Send, CheckCircle2, AlertCircle, Loader2 } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import { supabase } from '$lib/supabase';
    import { onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import FullPageLoading from '$lib/components/full-page-loading.svelte';

    let inviteEmail = $state("");
    let inviteRole = $state("staff");
    let adminPassword = $state("");
    let isLoading = $state(false);
    let adminProfile = $state<any>(null);
    let pageLoading = $state(true);

    const roles = [
        { value: "admin", label: "Administrator" },
        { value: "staff", label: "Staff" },
        { value: "guest", label: "Guest" }
    ];

    onMount(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                goto('/login');
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
            goto('/settings');
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
<div class="flex flex-col gap-6 p-4 md:px-8 md:py-6 lg:px-12 lg:py-8 max-w-2xl mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" onclick={() => goto('/settings')} class="rounded-xl">
            <ChevronLeft class="h-5 w-5" />
        </Button>
        <div>
            <h1 class="text-2xl font-bold">Invite User</h1>
            <p class="text-muted-foreground text-sm">Add a new admin or staff member securely</p>
        </div>
    </div>

    <div class="space-y-6">
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
                <div class="grid grid-cols-3 gap-2">
                    {#each roles as role}
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
                <Input 
                    id="password" 
                    type="password" 
                    placeholder="Enter your current password" 
                    bind:value={adminPassword}
                />
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
            <p class="text-xs text-muted-foreground leading-relaxed">The invitee will receive an email directly from Supabase to set up their account. This invitation bypasses 2FA for convenience.</p>
        </div>
    </div>
</div>
{/if}

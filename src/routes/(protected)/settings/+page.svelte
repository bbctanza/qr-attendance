<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Badge } from "$lib/components/ui/badge";
    import { Separator } from "$lib/components/ui/separator";
    import { goto } from '$app/navigation';
    import { ChevronRight, Edit, Clock, Calendar, Users, Settings, LogOut, BarChart3, Info, UserPlus, ShieldAlert, Construction } from '@lucide/svelte';
    import { supabase } from '$lib/supabase';
    import { onMount } from 'svelte';
    import FullPageLoading from '$lib/components/full-page-loading.svelte';
    import AboutModal from '$lib/components/about-modal.svelte';
    import ChangelogModal from '$lib/components/changelog-modal.svelte';
    import { CURRENT_VERSION } from '$lib/config/changelog';

    let user = $state({ name: 'User', role: 'Staff', avatar: '' });
    let isLoading = $state(true);
    let isAboutOpen = $state(false);
    let isChangelogOpen = $state(false);

    onMount(async () => {
        await fetchProfile();
    });

    async function fetchProfile() {
        isLoading = true;
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) {
                const { data: prof } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();

                if (prof) {
                    user = {
                        name: prof.full_name || authUser.user_metadata?.full_name || 'User',
                        role: prof.role ? prof.role.charAt(0).toUpperCase() + prof.role.slice(1) : 'Staff',
                        avatar: prof.avatar_url || authUser.user_metadata?.avatar_url || ''
                    };
                } else {
                    user = {
                        name: authUser.user_metadata?.full_name || 'User',
                        role: 'Staff',
                        avatar: authUser.user_metadata?.avatar_url || ''
                    };
                }
            }
        } catch (e) {
            console.error('Error fetching profile in settings:', e);
        } finally {
            isLoading = false;
        }
    }

    function open(path: string) {
        // navigate to route if provided
        if (path) goto(path);
    }

    async function handleLogout() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error logging out:', error);
        } else {
            goto('/');
        }
    }
</script> 

{#if isLoading}
    <FullPageLoading message="Loading settings..." />
{:else}
<div class="flex flex-col gap-6 p-4 md:px-8 md:py-6 lg:px-12 lg:py-8 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
            <h1 class="text-2xl md:text-3xl font-bold">Settings</h1>
            <p class="text-muted-foreground text-sm md:text-base mt-1">Manage your profile and preferences</p>
        </div>
    </div>

    <!-- Profile Card -->
    <div class="rounded-2xl border border-border/30 bg-card px-4 sm:px-6 py-6 sm:py-8">
        <div class="flex flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-4 min-w-0 flex-1">
                <Avatar class="h-16 w-16 sm:h-20 sm:w-20 shrink-0">
                    {#if user.avatar}
                        <AvatarImage src={user.avatar} alt={user.name} />
                    {:else}
                        <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('').substring(0,2)}</AvatarFallback>
                    {/if}
                </Avatar>
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-lg sm:text-xl truncate">{user.name}</div>
                    <Badge class="mt-2">{user.role}</Badge>
                </div>
            </div>
            <button class="p-2 text-muted-foreground hover:text-foreground transition-colors self-start sm:self-auto" aria-label="Edit profile" onclick={() => open('/settings/profile')}>
                <Edit class="h-5 w-5" />
            </button>
        </div>
    </div>

    <!-- Sections Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <!-- Tracking & Data Section -->
        <div>
            <h2 class="text-sm font-semibold tracking-widest text-muted-foreground/60 mb-4 uppercase">Tracking & Data</h2>
            <div class="space-y-3 sm:space-y-4">
                <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/attendance/history')}> 
                    <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><Clock class="h-5 w-5" /></div>
                    <div class="flex-1 text-left min-w-0">
                        <div class="font-bold text-sm sm:text-base">Attendance History</div>
                        <div class="text-xs sm:text-sm text-muted-foreground truncate">Review past check-ins</div>
                    </div>
                    <ChevronRight class="text-muted-foreground shrink-0" />
                </button>
                <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/analytics')}> 
                    <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><BarChart3 class="h-5 w-5" /></div>
                    <div class="flex-1 text-left min-w-0">
                        <div class="font-bold text-sm sm:text-base">Analytics</div>
                        <div class="text-xs sm:text-sm text-muted-foreground truncate">View attendance insights</div>
                    </div>
                    <ChevronRight class="text-muted-foreground shrink-0" />
                </button>
                {#if user.role === 'Admin' || user.role === 'Developer'}
                <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/analytics/audit-logs')}> 
                    <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><ShieldAlert class="h-5 w-5" /></div>
                    <div class="flex-1 text-left min-w-0">
                        <div class="font-bold text-sm sm:text-base">Audit Logs</div>
                        <div class="text-xs sm:text-sm text-muted-foreground truncate">Track changes & data</div>
                    </div>
                    <ChevronRight class="text-muted-foreground shrink-0" />
                </button>
                {/if}
            </div>
        </div>

        <!-- Administration Section -->
        <div>
            <h2 class="text-sm font-semibold tracking-widest text-muted-foreground/60 mb-4 uppercase">Administration</h2>
            <div class="space-y-3 sm:space-y-4">
                <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/events')}> 
                    <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><Calendar class="h-5 w-5" /></div>
                    <div class="flex-1 text-left min-w-0">
                        <div class="font-bold text-sm sm:text-base">Manage Events</div>
                        <div class="text-xs sm:text-sm text-muted-foreground truncate">Create and edit events</div>
                    </div>
                    <ChevronRight class="text-muted-foreground shrink-0" />
                </button>

                <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/groups')}> 
                    <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><Users class="h-5 w-5" /></div>
                    <div class="flex-1 text-left min-w-0">
                        <div class="font-bold text-sm sm:text-base">Manage Groups</div>
                        <div class="text-xs sm:text-sm text-muted-foreground truncate">Organize members</div>
                    </div>
                    <ChevronRight class="text-muted-foreground shrink-0" />
                </button>

                {#if user.role === 'Admin' || user.role === 'Developer'}
                    <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/settings/invite')}> 
                        <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><UserPlus class="h-5 w-5" /></div>
                        <div class="flex-1 text-left min-w-0">
                            <div class="font-bold text-sm sm:text-base">Manage Staff</div>
                            <div class="text-xs text-muted-foreground truncate">Invite & manage user roles</div>
                        </div>
                        <ChevronRight class="text-muted-foreground shrink-0" />
                    </button>
                {/if}
            </div>
        </div>
    </div>

    <!-- System Section -->
    <div>
        <h2 class="text-sm font-semibold tracking-widest text-muted-foreground/60 mb-4 uppercase">System</h2>
        <div class="space-y-3 sm:space-y-4">
            <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/settings/app')}> 
                <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><Settings class="h-5 w-5" /></div>
                <div class="flex-1 text-left min-w-0">
                    <div class="font-bold text-sm sm:text-base">App Settings</div>
                    <div class="text-xs sm:text-sm text-muted-foreground truncate">Preferences & Notifications</div>
                </div>
                <ChevronRight class="text-muted-foreground shrink-0" />
            </button>

            {#if user.role === 'Developer'}
                <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => open('/settings/dev')}> 
                    <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><Construction class="h-5 w-5" /></div>
                    <div class="flex-1 text-left min-w-0">
                        <div class="font-bold text-sm sm:text-base">Developer Tools</div>
                        <div class="text-xs sm:text-sm text-muted-foreground truncate">Debug & test features</div>
                    </div>
                    <ChevronRight class="text-muted-foreground shrink-0" />
                </button>
            {/if}

            <button class="w-full flex items-center gap-4 py-3 px-4 sm:px-6 rounded-2xl bg-card/20 border border-border/20 hover:border-border/40 hover:bg-card/30 transition-all" onclick={() => isAboutOpen = true}> 
                <div class="p-3 rounded-md bg-primary/10 text-primary shrink-0"><Info class="h-5 w-5" /></div>
                <div class="flex-1 text-left min-w-0">
                    <div class="font-bold text-sm sm:text-base">About</div>
                    <div class="text-xs sm:text-sm text-muted-foreground truncate">About this application</div>
                </div>
                <ChevronRight class="text-muted-foreground shrink-0" />
            </button>
        </div>
    </div>

    <!-- Footer -->
    <Separator class="my-4" />
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
        <button class="text-red-500 font-bold hover:text-red-600 transition-colors text-sm sm:text-base" onclick={handleLogout}>
            <LogOut class="h-4 w-4 inline mr-2" />
            Log Out
        </button>
        <div class="text-xs text-muted-foreground text-center sm:text-right">QR Attendance System v{CURRENT_VERSION}</div>
    </div>
</div>
{/if}

<!-- About Modal -->
<AboutModal 
    bind:open={isAboutOpen} 
    onViewChangelog={() => {
        isAboutOpen = false;
        isChangelogOpen = true;
    }}
/>

<!-- Changelog Modal -->
<ChangelogModal bind:open={isChangelogOpen} />

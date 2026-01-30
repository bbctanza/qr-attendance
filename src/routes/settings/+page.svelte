<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Badge } from "$lib/components/ui/badge";
    import { Separator } from "$lib/components/ui/separator";
    import { goto } from '$app/navigation';
    import { ChevronRight, Edit, Clock, Calendar, Users, Settings, LogOut } from '@lucide/svelte';

    let user = $state({ name: 'Alex Chen', role: 'Administrator', avatar: '' });
    let version = $state('QR Attendance System v1.2.0');

    function open(path: string) {
        // navigate to route if provided
        if (path) goto(path);
    }

    function handleLogout() {
        // placeholder for logout
        console.log('logout');
    }
</script> 

<div class="max-w-xl mx-auto px-6 flex flex-col gap-6">

    <!-- Profile Card -->
    <div class="rounded-2xl border border-border/30 bg-card px-6 py-8 flex items-center justify-between">
        <div class="flex items-center gap-4">
            <Avatar class="h-16 w-16">
                {#if user.avatar}
                    <AvatarImage src={user.avatar} alt={user.name} />
                {:else}
                    <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('').substring(0,2)}</AvatarFallback>
                {/if}
            </Avatar>
            <div>
                <div class="font-bold text-lg">{user.name}</div>
                <Badge class="mt-1">{user.role}</Badge>
            </div>
        </div>
        <button class="p-2 text-muted-foreground hover:text-foreground" aria-label="Edit profile">
            <Edit class="h-5 w-5" />
        </button>
    </div>

    <!-- Sections -->
    <div>
        <div class="text-xs font-semibold tracking-widest text-muted-foreground/60 mb-3">TRACKING & DATA</div>
        <div class="space-y-4">
            <button class="w-full flex items-center gap-4 py-3 px-6 rounded-2xl bg-card/20 border border-border/20" onclick={() => open('/attendance/history')}> 
                <div class="p-3 rounded-md bg-primary/10 text-primary"><Clock class="h-5 w-5" /></div>
                <div class="flex-1 text-left">
                    <div class="font-bold">Attendance History</div>
                    <div class="text-sm text-muted-foreground">Review past check-ins</div>
                </div>
                <ChevronRight class="text-muted-foreground" />
            </button>
            <button class="w-full flex items-center gap-4 py-3 px-6 rounded-2xl bg-card/20 border border-border/20" onclick={() => open('/events')}> 
                <div class="p-3 rounded-md bg-primary/10 text-primary"><Calendar class="h-5 w-5" /></div>
                <div class="flex-1 text-left">
                    <div class="font-bold">Events</div>
                    <div class="text-sm text-muted-foreground">Manage events and schedules</div>
                </div>
                <ChevronRight class="text-muted-foreground" />
            </button>
        </div>
    </div>

    <div>
        <div class="text-xs font-semibold tracking-widest text-muted-foreground/60 mb-3">ADMINISTRATION</div>
        <div class="space-y-4">
            <button class="w-full flex items-center gap-4 py-3 px-6 rounded-2xl bg-card/20 border border-border/20" onclick={() => open('/events')}> 
                <div class="p-3 rounded-md bg-primary/10 text-primary"><Calendar class="h-5 w-5" /></div>
                <div class="flex-1 text-left">
                    <div class="font-bold">Manage Events</div>
                    <div class="text-sm text-muted-foreground">Create and edit events</div>
                </div>
                <ChevronRight class="text-muted-foreground" />
            </button>

            <button class="w-full flex items-center gap-4 py-3 px-6 rounded-2xl bg-card/20 border border-border/20" onclick={() => open('/groups')}> 
                <div class="p-3 rounded-md bg-primary/10 text-primary"><Users class="h-5 w-5" /></div>
                <div class="flex-1 text-left">
                    <div class="font-bold">Manage Groups</div>
                    <div class="text-sm text-muted-foreground">Organize members</div>
                </div>
                <ChevronRight class="text-muted-foreground" />
            </button>
        </div>
    </div>

    <div>
        <div class="text-xs font-semibold tracking-widest text-muted-foreground/60 mb-3">SYSTEM</div>
        <div class="space-y-4">
            <button class="w-full flex items-center gap-4 py-3 px-6 rounded-2xl bg-card/20 border border-border/20" onclick={() => open('/settings/app')}> 
                <div class="p-3 rounded-md bg-primary/10 text-primary"><Settings class="h-5 w-5" /></div>
                <div class="flex-1 text-left">
                    <div class="font-bold">App Settings</div>
                    <div class="text-sm text-muted-foreground">Preferences & Notify</div>
                </div>
                <ChevronRight class="text-muted-foreground" />
            </button>
        </div>
    </div>

    <div class="text-center mt-6">
        <button class="text-red-500 font-bold" onclick={handleLogout}>Log Out</button>
        <div class="text-xs text-muted-foreground mt-4">{version}</div>
    </div>
</div>

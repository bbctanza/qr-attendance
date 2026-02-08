<script lang="ts">
    import { Search, ScanLine, X } from "@lucide/svelte";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Input } from "$lib/components/ui/input";
    import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "$lib/components/ui/card";
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { page } from "$app/stores";
    import FullPageLoading from "$lib/components/full-page-loading.svelte";
    import { formatLocalTime } from '$lib/utils/time';

    let allScans = $state<any[]>([]);
    let isLoading = $state(true);
    let searchQuery = $state("");
    let currentEventId = $state<string | null>(null);

    onMount(async () => {
        // Get current event ID
        const { data: currentEvent } = await supabase
            .from('events')
            .select('event_id')
            .eq('status', 'ongoing')
            .limit(1)
            .maybeSingle();
        
        if (currentEvent) {
            currentEventId = currentEvent.event_id;
            await fetchAllScans(currentEvent.event_id);
        }
        
        isLoading = false;
    });

    async function fetchAllScans(eventId: string) {
        const { data } = await supabase
            .from('attendance_scans')
            .select('*, members(*)')
            .eq('event_id', eventId)
            .order('scan_datetime', { ascending: false });
        
        if (data) {
            allScans = await Promise.all(data.map(async (s) => ({
                id: s.scan_id,
                name: s.members ? `${s.members.first_name} ${s.members.last_name}` : 'Unknown Member',
                role: s.members?.metadata?.role || 'Member',
                time: await formatLocalTime(s.scan_datetime),
                avatar: s.members ? `https://api.dicebear.com/7.x/initials/svg?seed=${s.members.first_name}%20${s.members.last_name}` : 'https://api.dicebear.com/7.x/initials/svg?seed=U'
            })));
        }
    }

    let filteredScans = $derived(
        allScans.filter(scan => 
            scan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            scan.role.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );
</script>

{#if isLoading}
    <FullPageLoading message="Loading check-ins..." />
{:else}
    <div class="flex flex-col h-full gap-6 p-4 md:p-8">
        <!-- Search Input -->
        <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
                type="text"
                placeholder="Search by name or role..."
                class="pl-10 h-11"
                bind:value={searchQuery}
            />
        </div>

        <!-- Scans List -->
        <div class="flex-1 grid gap-3 overflow-y-auto">
            {#if filteredScans && filteredScans.length > 0}
                {#each filteredScans as scan (scan.id)}
                    <div class="p-4 rounded-lg bg-card border border-border/40 shadow-sm hover:shadow-md hover:bg-muted/30 transition-all flex items-center justify-between group">
                        <div class="flex items-center gap-3 min-w-0">
                            <Avatar class="h-12 w-12 rounded-full flex-shrink-0">
                                <AvatarImage src={scan.avatar} alt={scan.name} />
                                <AvatarFallback>{scan.name?.charAt(0) || '?'}</AvatarFallback>
                            </Avatar>
                            <div class="min-w-0">
                                <div class="font-semibold text-sm sm:text-base truncate">{scan.name}</div>
                                <div class="text-xs text-muted-foreground">{scan.role}</div>
                            </div>
                        </div>
                        <div class="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 flex-shrink-0 ml-2">
                            <span class="font-medium">{scan.time}</span>
                            <span class="h-2 w-2 rounded-full bg-green-500 flex-shrink-0"></span>
                        </div>
                    </div>
                {/each}
            {:else}
                <div class="flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full">
                    <ScanLine class="h-12 w-12 mb-2 opacity-30" />
                    <p class="text-sm">
                        {searchQuery ? 'No matching check-ins found.' : 'No check-ins yet.'}
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}

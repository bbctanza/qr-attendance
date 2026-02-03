<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Camera, QrCode, Search, CheckCircle2, X, Plus, MapPin as MapPinIcon } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { Avatar, AvatarImage } from "$lib/components/ui/avatar";
    import { ScrollArea } from "$lib/components/ui/scroll";
    import { onMount, onDestroy } from 'svelte';
    import { attendanceApi } from '$lib/api/attendance';
    import { supabase } from '$lib/supabase';
	import type { AttendanceEvent } from '$lib/types';

    let manualId = $state("");
    let lastScanned = $state<{ id: string, name: string, timestamp: string } | null>(null);
    let isScanning = $state(false); // Controls camera UI visibility
    let activeEvent = $state<AttendanceEvent | null>(null);
    let isLoading = $state(true);

    /* Recently scanned members in this session */
    let recentScans = $state<{ id: string, name: string, time: string }[]>([]);

    onMount(async () => {
        await loadActiveEvent();
    });

    async function loadActiveEvent() {
        isLoading = true;
        try {
            // 1. Try Ongoing
            const ongoing = await attendanceApi.getOngoingEvents();
            if (ongoing && ongoing.length > 0) {
                activeEvent = ongoing[0]; // Pick first active
            } else {
                // 2. Try Upcoming (next 2 hours?)
                const upcoming = await attendanceApi.getUpcomingEvents();
                if (upcoming && upcoming.length > 0) {
                    activeEvent = upcoming[0];
                }
            }
        } catch (e) {
            console.error(e);
            toast.error("Failed to load active event");
        } finally {
            isLoading = false;
        }
    }

    async function handleScan(id: string) {
        if (!id) return;
        if (!activeEvent) {
            toast.error("No active event found to scan into.");
            return;
        }

        const toastId = toast.loading("Checking in...");

        try {
            // 1. Verify Member exists & Get Name
            const { data: member, error: memberError } = await supabase
                .from('members')
                .select('first_name, last_name')
                .eq('member_id', id)
                .single();
            
            if (memberError || !member) {
                toast.error(`Member ID ${id} not found`, { id: toastId });
                return;
            }

            const fullName = `${member.first_name} ${member.last_name}`;

            // 2. Perform Scan
            await attendanceApi.scanMember(id, activeEvent.event_id);

            // 3. Success UI
            const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            lastScanned = {
                id: id,
                name: fullName,
                timestamp: time
            };

            // Add to local list if not already there
            if (!recentScans.find(s => s.id === id)) {
                recentScans = [{ id, name: fullName, time }, ...recentScans];
            }

            toast.success(`checked in ${fullName}`, { id: toastId });
            manualId = ""; // Clear input

        } catch (e: any) {
            console.error(e);
            if (e.message?.includes('duplicate')) {
                 toast.info(`Member ${id} already checked in`, { id: toastId });
            } else {
                 toast.error("Scan failed: " + e.message, { id: toastId });
            }
        }
    }

    function handleManualSubmit() {
        if (!manualId) return;
        handleScan(manualId);
    }

    function toggleCamera() {
        isScanning = !isScanning;
    }

    /* Event Session Display */
    let session = $derived(activeEvent ? {
        title: activeEvent.event_name,
        location: (activeEvent.metadata as any)?.location || 'Main Sanctuary',
        timeStart: new Date(activeEvent.start_datetime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
        timeEnd: new Date(activeEvent.end_datetime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
        isActive: activeEvent.status === 'ongoing'
    } : null);

    // Toggle a class on <body> to hide the mobile nav when items are selected (use $effect in runes mode)
    $effect(() => {
        if (typeof document === 'undefined') return;
        if (recentScans.length > 0) document.body.classList.add('hide-mobile-nav');
        else document.body.classList.remove('hide-mobile-nav');
        return () => {
            if (typeof document !== 'undefined') document.body.classList.remove('hide-mobile-nav');
        };
    });

    onDestroy(() => {
        if (typeof document !== 'undefined') document.body.classList.remove('hide-mobile-nav');
    });
</script>

<!-- Mobile View -->
<div class="flex flex-col gap-6 p-4 md:hidden pb-24">

    <!-- Active Event Info (Mobile) -->
    {#if session}
        <div class="rounded-xl bg-primary/10 p-4 border border-primary/20">
            <h3 class="font-bold text-primary">{session.title}</h3>
            <div class="text-xs text-muted-foreground mt-1 flex gap-2">
                <span>{session.timeStart} - {session.timeEnd}</span>
                <span>•</span>
                <span>{session.location}</span>
            </div>
            {#if !session.isActive}
                <div class="mt-2 text-xs font-bold text-amber-500">Not currently active</div>
            {/if}
        </div>
    {:else if isLoading}
        <div class="text-center p-4 text-muted-foreground">Loading event...</div>
    {:else}
         <div class="rounded-xl bg-destructive/10 p-4 border border-destructive/20 text-destructive text-center font-bold">
            No Active Event Found
        </div>
    {/if}

    <!-- Camera Scan card -->
    <div class="rounded-2xl border-2 border-dashed border-border/40 p-6 flex flex-col items-center gap-6">
        <div class="rounded-lg bg-card/20 p-6 border border-border/20">
            <Camera class="h-10 w-10 text-primary" />
        </div>
        <div class="text-center">
            <p class="font-bold text-foreground">Ready to Scan</p>
            <p class="text-xs text-muted-foreground mt-2">Point your camera at the member's QR code</p>
        </div>
        <Button class="mt-3 w-56 h-12 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" onclick={toggleCamera}>
            <QrCode class="mr-2 h-4 w-4" /> Start Camera
        </Button>
    </div>

    <!-- OR divider -->
    <div class="flex items-center gap-3">
        <div class="h-px bg-border flex-1"></div>
        <div class="text-xs text-muted-foreground uppercase tracking-[0.12em]">Or manual</div>
        <div class="h-px bg-border flex-1"></div>
    </div>

    <!-- Manual Entry -->
    <div>
        <h3 class="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Manual Check-In</h3>
        <div class="flex items-center gap-2">
            <div class="relative flex-1">
                <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <input type="text" placeholder="Member ID..." bind:value={manualId} onkeydown={(e) => e.key === 'Enter' && handleManualSubmit()} class="w-full bg-card/20 border border-border/20 rounded-2xl py-4 pl-12 pr-4 text-sm placeholder-muted-foreground-mobile" />
            </div>
            <Button class="h-10 w-10 p-0 flex items-center justify-center rounded-lg bg-(--color-primary) text-(--color-primary-foreground)" onclick={handleManualSubmit} aria-label="Add" disabled={!manualId}>
                <CheckCircle2 class="h-4 w-4" />
            </Button>
        </div>
    </div>

    <!-- Recent Scans list -->
    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <div class="text-xs font-black uppercase text-muted-foreground tracking-wider">Recent Scans ({recentScans.length})</div>
            {#if recentScans.length > 0}
                <button class="text-xs text-primary" onclick={() => recentScans = []}>Clear list</button>
            {/if}
        </div>
        {#each recentScans as m (m.id + m.time)}
            <div class="flex items-center gap-4 p-4 rounded-2xl bg-card/40 border border-border/40">
                <div class="h-12 w-12 rounded-full bg-linear-to-br from-green-500/10 to-green-500/30 flex items-center justify-center font-bold text-green-600">
                    <CheckCircle2 class="h-5 w-5" />
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-foreground text-sm truncate">{m.name}</div>
                    <div class="text-xs text-muted-foreground font-mono">ID: {m.id} • {m.time}</div>
                </div>
            </div>
        {:else}
             <div class="text-center text-xs text-muted-foreground py-4">No scans yet this session</div>
        {/each}
    </div>

</div>

<!-- Desktop View -->
<div class="hidden md:grid md:grid-cols-3 gap-6 p-6 lg:p-8 md:min-h-[calc(100vh-240px)]">

    <!-- Left Column: Scanner -->
    <div class="col-span-2 flex flex-col gap-6 h-full">

        <!-- Active Event Banner -->
        {#if session}
             <Card class="bg-primary/5 border-primary/20">
                <CardHeader>
                    <CardTitle class="text-primary">{session.title}</CardTitle>
                    <CardDescription>{session.timeStart} - {session.timeEnd} • {session.location}</CardDescription>
                </CardHeader>
             </Card>
        {/if}

        <!-- Scanner Area -->
        <div class="rounded-2xl border-2 border-dashed border-(--stat-success)/20 p-16 flex items-center justify-center flex-1 min-h-0 bg-card/5">
                {#if isScanning}
                    <div class="relative flex-1 rounded-md overflow-hidden bg-black/80 flex items-center justify-center w-full min-h-80">
                        <div class="absolute inset-6 border-2 border-white/20 rounded-lg"></div>
                        <p class="text-white/70 animate-pulse">Camera Active (Mock)...</p>
                    </div>
                {:else}
                    <div class="text-center w-full max-w-xl">
                        <div class="mx-auto w-max">
                            <div class="bg-background rounded-lg p-8 border border-border/20">
                                <Camera class="h-16 w-16 text-(--stat-success)" />
                            </div>
                        </div>
                        <p class="mt-8 text-2xl font-bold">Ready to Scan</p>
                        <p class="text-base text-muted-foreground mt-3">Point your camera at the member's QR code</p>
                        <div class="mt-8">
                            <Button class="inline-flex items-center gap-3 bg-(--stat-success) text-white h-14 px-8 rounded-full shadow-[0_6px_18px_rgba(0,0,0,0.12)] text-base" onclick={toggleCamera}>
                                <span class="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-white/10 text-white"><QrCode class="h-5 w-5" /></span>
                                <span>Start Camera</span>
                            </Button>
                        </div>
                    </div>
                {/if} 
            </div>
    </div>

    <!-- Right Column: Manual Entry + Recent -->
    <aside class="col-span-1 flex flex-col space-y-6 h-full">

    <!-- Manual Entry -->
    <Card>
        <CardHeader>
            <CardTitle>Manual Check-In</CardTitle>
            <CardDescription>Enter Member ID</CardDescription>
        </CardHeader> 
        <CardContent>
            <div class="flex gap-2">
                <div class="grid w-full items-center gap-1.5">
                    <Label for="memberId" class="sr-only">Member ID</Label>
                    <Input 
                        id="memberId" 
                        placeholder="Member ID..." 
                        bind:value={manualId} 
                        onkeydown={(e) => e.key === 'Enter' && handleManualSubmit()}
                    />
                </div>
                <Button onclick={handleManualSubmit} disabled={!manualId}>
                    Check In
                </Button>
            </div>
        </CardContent>
    </Card>

    <!-- Recent Scans -->
    <Card class="flex-1 flex flex-col min-h-0">
        <CardHeader class="flex items-center justify-between">
            <CardTitle>Recent Scans</CardTitle>
            {#if recentScans.length > 0}
                <button class="text-xs text-(--stat-success)" onclick={() => recentScans = []}>Clear list</button>
            {/if}
        </CardHeader>
        <ScrollArea className="flex-1 h-px">
            <div class="p-6 pt-0 space-y-4">
                {#each recentScans as scan (scan.id + scan.time)}
                    <div class="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
                        <Avatar class="h-10 w-10 rounded-full">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${scan.name}`} alt={scan.name} />
                        </Avatar>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold truncate text-sm">{scan.name}</div>
                            <div class="text-xs text-muted-foreground">{scan.time}</div>
                        </div>
                        <CheckCircle2 class="h-4 w-4 text-green-500" />
                    </div>
                {:else}
                    <div class="text-center text-sm text-muted-foreground mt-10">
                        No scans yet this session.
                    </div>
                {/each}
            </div>
        </ScrollArea>
    </Card>

    </aside>
</div>

<style>
    @keyframes scan {
        0%, 100% { top: 10%; }
        50% { top: 90%; }
    }
</style>


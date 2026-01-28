<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Camera, QrCode, Search, CheckCircle2, X, MapPin as MapPinIcon } from "@lucide/svelte";
    import { Avatar, AvatarImage } from "$lib/components/ui/avatar";

    let manualId = $state("");
    let lastScanned = $state<{ id: string, name: string, timestamp: string } | null>(null);
    let isScanning = $state(false);

    /* Selected members for manual entry */
    let selectedMembers = $state([
        { id: '88219', name: 'Sarah Jones' },
        { id: '99312', name: 'Mike Chen' }
    ]);

    function handleScan(id: string) {
        // Mock success
        lastScanned = {
            id: id,
            name: "Member #" + id,
            timestamp: new Date().toLocaleTimeString()
        };
        manualId = "";
    }

    function toggleCamera() {
        isScanning = !isScanning;
    }

    function removeSelected(id: string) {
        selectedMembers = selectedMembers.filter(m => m.id !== id);
    }

    import { onDestroy } from 'svelte';

    function clearSelected() {
        selectedMembers = [];
    }

    function saveAttendance() {
        // Mock save: clear selected and show a quick success state
        selectedMembers = [];
        lastScanned = { id: 'SAVE', name: 'Saved', timestamp: new Date().toLocaleTimeString() };
        setTimeout(() => (lastScanned = null), 1500);
    }

    /* Attendance status (mock data) */
    let session = $state({
        title: 'Q3 Quarterly Review',
        location: 'Main Conference Hall',
        timeStart: '14:00',
        timeEnd: '16:00',
        minutesLeft: 45,
        elapsed: '01h 15m',
        participation: 84,
        checkedIn: 0,
        expected: 50,
    });

    $effect(() => {
        // keep checkedIn in sync with selectedMembers (mock)
        session = { ...session, checkedIn: selectedMembers.length };
    });

    // Toggle a class on <body> to hide the mobile nav when items are selected (use $effect in runes mode)
    $effect(() => {
        if (typeof document === 'undefined') return;
        if (selectedMembers.length > 0) document.body.classList.add('hide-mobile-nav');
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
        <h3 class="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Manual Entry</h3>
        <div class="relative">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input type="text" placeholder="Search by name or ID..." bind:value={manualId} class="w-full bg-card/20 border border-border/20 rounded-2xl py-4 pl-12 pr-4 text-sm placeholder-muted-foreground-mobile" />
        </div>
    </div>

    <!-- Selected list -->
    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <div class="text-xs font-black uppercase text-muted-foreground tracking-wider">Selected ({selectedMembers.length})</div>
            <button class="text-xs text-primary" onclick={clearSelected}>Clear all</button>
        </div>
        {#each selectedMembers as m}
            <div class="flex items-center gap-4 p-4 rounded-2xl bg-card/40 border border-border/40">
                <div class="h-12 w-12 rounded-full bg-linear-to-br from-primary/10 to-primary/30 flex items-center justify-center font-bold text-primary">{m.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-foreground text-sm truncate">{m.name}</div>
                    <div class="text-xs text-muted-foreground font-mono">ID: {m.id}</div>
                </div>
                <button class="h-8 w-8 rounded-full bg-card flex items-center justify-center text-muted-foreground hover:bg-muted/10" onclick={() => removeSelected(m.id)} aria-label="Remove">
                    <X class="h-4 w-4" />
                </button>
            </div>
        {/each}
    </div>

</div>

    <!-- Success Feedback (Last Scanned) -->
    {#if lastScanned}
        <div class="p-4 rounded-3xl bg-primary/10 border border-primary/20 animate-in fade-in slide-in-from-bottom-2">
            <div class="flex items-center gap-4">
                <div class="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground">
                    <CheckCircle2 class="h-6 w-6" />
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold truncate">{lastScanned.name}</div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-widest font-black">ID: {lastScanned.id} • {lastScanned.timestamp}</div>
                </div>
            </div>
        </div>
    {/if}
<!-- Fixed Save Button for Mobile -->
{#if selectedMembers.length > 0}
    <div class="fixed left-4 right-4 bottom-4 md:hidden">
        <Button class="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" onclick={saveAttendance}>
            Save Attendance ({selectedMembers.length}) &nbsp; <span class="ml-2">→</span>
        </Button>
    </div>
{/if}

<!-- Desktop View -->
<div class="hidden md:grid md:grid-cols-3 gap-6 p-6 lg:p-8">
    <div class="space-y-1 text-center md:text-left">
        <h2 class="text-3xl font-bold tracking-tight">Check-in</h2>
        <p class="text-muted-foreground">Scan QR codes or enter Member IDs manually.</p>
    </div>

    <div class="col-span-2 space-y-6">

    <!-- Scanner Area -->
    <Card class="border-2 border-dashed border-primary/20 overflow-hidden {isScanning ? 'bg-black' : 'bg-muted/30'}">
        <CardContent class="p-0 min-h-75 flex flex-col items-center justify-center relative">
            {#if isScanning}
                <div class="absolute inset-0 flex items-center justify-center">
                    <p class="text-white/70 animate-pulse">Camera Active (Mock)...</p>
                    <div class="absolute inset-x-12 inset-y-24 border-2 border-white/50 rounded-lg"></div>
                </div>
                <Button variant="secondary" size="sm" class="absolute bottom-4" onclick={toggleCamera}>
                    Stop Camera
                </Button>
            {:else}
                <div class="flex flex-col items-center gap-4 p-8 text-center text-muted-foreground">
                    <div class="rounded-full bg-background p-4 shadow-sm">
                        <Camera class="h-8 w-8" />
                    </div>
                    <div>
                        <p class="font-medium text-foreground">Camera is off</p>
                        <p class="text-sm">Tap below to start scanning</p>
                    </div>
                    <Button onclick={toggleCamera}>
                        <QrCode class="mr-2 h-4 w-4" /> Start Scanner
                    </Button>
                </div>
            {/if}
        </CardContent>
    </Card>

    <!-- Manual Entry -->
    <Card>
        <CardHeader>
            <CardTitle>Manual Entry</CardTitle>
            <CardDescription>Enter the Member ID or Name if scanning fails.</CardDescription>
        </CardHeader>
        <CardContent>
            <div class="flex gap-2">
                <div class="grid w-full items-center gap-1.5">
                    <Label for="memberId" class="sr-only">Member ID</Label>
                    <Input 
                        id="memberId" 
                        placeholder="e.g. 1045 or 'John Doe'" 
                        bind:value={manualId} 
                        onkeydown={(e) => e.key === 'Enter' && handleScan(manualId)}
                    />
                </div>
                <Button onclick={() => handleScan(manualId)} disabled={!manualId}>
                    Check In
                </Button>
            </div>
        </CardContent>
    </Card>

    <!-- Success Feedback (Last Scanned) -->
    {#if lastScanned}
        <Card class="bg-green-500/10 border-green-500/20">
            <CardHeader class="pb-2">
                <CardTitle class="flex items-center text-green-600 text-lg">
                    <CheckCircle2 class="mr-2 h-5 w-5" /> Check-in Successful
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="flex justify-between items-center">
                    <div>
                        <p class="font-bold text-foreground">{lastScanned.name}</p>
                        <p class="text-xs text-muted-foreground">ID: {lastScanned.id}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-mono">{lastScanned.timestamp}</p>
                        <p class="text-xs text-muted-foreground">Checked In</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    {/if}
    </div>

    <!-- Right Sidebar -->
    <aside class="col-span-1 space-y-6">


        <Card>
            <CardHeader>
                <CardTitle>Recent Scans</CardTitle>
                <CardDescription>Latest check-ins</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
                {#if lastScanned}
                    <div class="flex items-center gap-3 p-3 rounded-lg bg-card/30">
                        <Avatar class="h-12 w-12 rounded-full">
                            <AvatarImage src="https://i.pravatar.cc/40?img=12" alt={lastScanned.name} />
                        </Avatar>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold truncate">{lastScanned.name}</div>
                            <div class="text-xs text-muted-foreground">ID: {lastScanned.id}</div>
                        </div>
                        <div class="text-xs text-muted-foreground">{lastScanned.timestamp}</div>
                    </div>
                {/if}

                <!-- Fallback mock list -->
                {#each [
                    { name: 'Mike Ross', role: 'Engineering Lead', time: '14:02' },
                    { name: 'David Chen', role: 'Marketing Specialist', time: '13:58' }
                ] as scan}
                    <div class="flex items-center gap-3 p-3 rounded-lg bg-card/30">
                        <Avatar class="h-10 w-10 rounded-full">
                            <AvatarImage src="https://i.pravatar.cc/40?img=14" alt={scan.name} />
                        </Avatar>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold truncate">{scan.name}</div>
                            <div class="text-xs text-muted-foreground">{scan.role}</div>
                        </div>
                        <div class="text-xs text-muted-foreground">{scan.time}</div>
                    </div>
                {/each}

            </CardContent>
        </Card>

    </aside>
</div>

<style>
    @keyframes scan {
        0%, 100% { top: 10%; }
        50% { top: 90%; }
    }
</style>


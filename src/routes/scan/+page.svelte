<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Camera, QrCode, Search, CheckCircle2, X, Plus, MapPin as MapPinIcon } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { Avatar, AvatarImage } from "$lib/components/ui/avatar";
    import { ScrollArea } from "$lib/components/ui/scroll";

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

    function addToSelected() {
        if (!manualId) return;
        // Add to selected members (use manualId as both id and name for now)
        selectedMembers = [...selectedMembers, { id: manualId, name: manualId }];
        const time = new Date().toLocaleTimeString();
        toast.success(`Added ${manualId} • ${time}`);
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
        const time = new Date().toLocaleTimeString();
        toast.success(`Attendance saved • ${time}`);
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
        // Assign the property directly to avoid reading `session` inside the effect
        session.checkedIn = selectedMembers.length;
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
        <div class="flex items-center gap-2">
            <div class="relative flex-1">
                <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <input type="text" placeholder="Search by name or ID..." bind:value={manualId} onkeydown={(e) => e.key === 'Enter' && addToSelected()} class="w-full bg-card/20 border border-border/20 rounded-2xl py-4 pl-12 pr-4 text-sm placeholder-muted-foreground-mobile" />
            </div>
            <Button class="h-10 w-10 p-0 flex items-center justify-center rounded-lg bg-(--color-primary) text-(--color-primary-foreground)" onclick={addToSelected} aria-label="Add">
                <Plus class="h-4 w-4" />
            </Button>
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


<!-- Fixed Save Button for Mobile -->
{#if selectedMembers.length > 0}
    <div class="fixed left-4 right-4 bottom-4 md:hidden">
        <Button class="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" onclick={saveAttendance}>
            Save Attendance ({selectedMembers.length}) &nbsp; <span class="ml-2">→</span>
        </Button>
    </div>
{/if}

<!-- Desktop View -->
<div class="hidden md:grid md:grid-cols-3 gap-6 p-6 lg:p-8 md:min-h-[calc(100vh-240px)]">

    <!-- Left Column: Scanner + Recent Scans -->
    <div class="col-span-2 flex flex-col gap-6 h-full">

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

    <!-- Recent Scans -->
    <Card class="flex-none">
        <CardHeader class="flex items-center justify-between">
            <div>
                <CardTitle>Recent Scans</CardTitle>
                <CardDescription>Latest check-ins</CardDescription>
            </div>
            <a href="/scan" class="text-xs text-(--color-primary) font-bold">View all</a>
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

            {#each [
                { name: 'Mike Ross', role: 'Engineering Lead', time: '14:02' },
                { name: 'David Chen', role: 'Marketing Specialist', time: '13:58' }
            ].slice(0, 2) as scan}
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

    </div>

    <!-- Right Column: Manual Entry + Selected -->
    <aside class="col-span-1 flex flex-col space-y-6 h-full">

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
                        onkeydown={(e) => e.key === 'Enter' && addToSelected()}
                    />
                </div>
                <Button onclick={addToSelected} disabled={!manualId}>
                    Add
                </Button>
            </div>
        </CardContent>
    </Card>

    <!-- Selected -->
    <Card class="flex-1 flex flex-col min-h-0">
        <CardHeader class="flex items-center justify-between">
            <CardTitle>Selected</CardTitle>
            <button class="text-xs text-(--stat-success)" onclick={clearSelected}>Clear all</button>
        </CardHeader>
        <CardContent class="p-0 flex-1 min-h-0">
            <ScrollArea className="h-full">
                <div class="space-y-3 p-3">
                    {#each selectedMembers as m}
                        <div class="flex items-center gap-3 p-3 rounded-lg bg-card/20">
                            <div class="h-10 w-10 rounded-full bg-(--stat-success)/20 flex items-center justify-center font-bold text-(--stat-success)">{m.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold truncate">{m.name}</div>
                                <div class="text-xs text-muted-foreground font-mono">ID: {m.id}</div>
                            </div>
                            <button class="h-8 w-8 rounded-full bg-card flex items-center justify-center text-muted-foreground hover:bg-muted/10" onclick={() => removeSelected(m.id)} aria-label="Remove">
                                <X class="h-4 w-4" />
                            </button>
                        </div>
                    {/each}

                    {#if selectedMembers.length === 0}
                        <div class="text-xs text-muted-foreground">No selected members</div>
                    {/if}
                </div>
            </ScrollArea>
        </CardContent>
        {#if selectedMembers.length > 0}
            <CardFooter>
                <Button class="w-full" onclick={saveAttendance}>
                    Save Attendance ({selectedMembers.length})
                </Button>
            </CardFooter>
        {/if}
    </Card>

    </aside>

</div>

<style>
    @keyframes scan {
        0%, 100% { top: 10%; }
        50% { top: 90%; }
    }
</style>


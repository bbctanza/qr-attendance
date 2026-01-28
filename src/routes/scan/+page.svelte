<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Camera, QrCode, Search, CheckCircle2 } from "@lucide/svelte";

    let manualId = $state("");
    let lastScanned = $state<{ id: string, name: string, timestamp: string } | null>(null);
    let isScanning = $state(false);

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
</script>

<!-- Mobile View -->
<div class="flex flex-col gap-6 p-4 md:hidden pb-28">
    <div class="space-y-1">
        <h2 class="text-2xl font-bold tracking-tight">Check-in</h2>
        <p class="text-xs text-muted-foreground">Scan QR codes or enter Member IDs manually.</p>
    </div>

    <!-- Scanner Area -->
    <div class="rounded-3xl bg-card border border-border/40 overflow-hidden shadow-xl {isScanning ? 'bg-black' : 'bg-muted/10'} aspect-square flex flex-col items-center justify-center relative">
        {#if isScanning}
            <div class="absolute inset-0 flex items-center justify-center">
                <p class="text-white/70 animate-pulse text-xs uppercase tracking-[0.2em] font-black">Camera Active</p>
                <!-- Scanner Frame -->
                <div class="absolute inset-12 border-2 border-primary/50 rounded-3xl">
                    <div class="absolute -top-1 -left-1 h-6 w-6 border-t-4 border-l-4 border-primary rounded-tl-xl"></div>
                    <div class="absolute -top-1 -right-1 h-6 w-6 border-t-4 border-r-4 border-primary rounded-tr-xl"></div>
                    <div class="absolute -bottom-1 -left-1 h-6 w-6 border-b-4 border-l-4 border-primary rounded-bl-xl"></div>
                    <div class="absolute -bottom-1 -right-1 h-6 w-6 border-b-4 border-r-4 border-primary rounded-br-xl"></div>
                    <!-- Scanning line -->
                    <div class="absolute inset-x-0 h-0.5 bg-primary/50 shadow-[0_0_15px_var(--primary)] animate-[scan_2s_linear_infinite]"></div>
                </div>
            </div>
            <Button variant="secondary" size="sm" class="absolute bottom-6 h-10 px-6 rounded-2xl bg-white/10 text-white border-white/20 hover:bg-white/20 backdrop-blur-md" onclick={toggleCamera}>
                Cancel
            </Button>
        {:else}
            <div class="flex flex-col items-center gap-6 p-8 text-center">
                <div class="rounded-3xl bg-background border border-border/40 p-6 shadow-sm">
                    <QrCode class="h-12 w-12 text-primary" />
                </div>
                <div class="space-y-1">
                    <p class="font-bold text-foreground">Scanner is Ready</p>
                    <p class="text-xs text-muted-foreground">Position the QR code within the frame</p>
                </div>
                <Button 
                    class="h-12 px-8 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-lg shadow-primary/10"
                    onclick={toggleCamera}
                >
                    Open Camera
                </Button>
            </div>
        {/if}
    </div>

    <!-- Manual Entry -->
    <div class="rounded-3xl bg-card border border-border/40 p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">Manual Entry</h3>
            <span class="text-[10px] font-black uppercase tracking-widest text-primary">OPTIONAL</span>
        </div>
        <div class="flex gap-2">
            <input 
                type="text" 
                placeholder="ID or Name" 
                class="flex-1 bg-muted/20 border border-border/40 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                bind:value={manualId} 
                onkeydown={(e) => e.key === 'Enter' && handleScan(manualId)}
            />
            <Button 
                class="h-12 w-12 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/10"
                onclick={() => handleScan(manualId)} 
                disabled={!manualId}
                size="icon"
            >
                <CheckCircle2 class="h-5 w-5" />
            </Button>
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
</div>

<!-- Desktop View -->
<div class="hidden md:flex flex-col gap-6 p-4 max-w-2xl mx-auto pt-8">
    <div class="space-y-1 text-center md:text-left">
        <h2 class="text-3xl font-bold tracking-tight">Check-in</h2>
        <p class="text-muted-foreground">Scan QR codes or enter Member IDs manually.</p>
    </div>

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

<style>
    @keyframes scan {
        0%, 100% { top: 10%; }
        50% { top: 90%; }
    }
</style>


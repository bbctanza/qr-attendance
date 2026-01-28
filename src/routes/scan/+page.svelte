<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Camera, QrCode, Search, CheckCircle2 } from "@lucide/svelte";

    let manualId = "";
    let lastScanned = null;
    let isScanning = false;

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

<div class="flex flex-col gap-6 p-4 md:max-w-2xl md:mx-auto">
    <div class="space-y-1 text-center md:text-left">
        <h2 class="text-3xl font-bold tracking-tight">Check-in</h2>
        <p class="text-muted-foreground">Scan QR codes or enter Member IDs manually.</p>
    </div>

    <!-- Scanner Area -->
    <Card class="border-2 border-dashed border-primary/20 overflow-hidden {isScanning ? 'bg-black' : 'bg-muted/30'}">
        <CardContent class="p-0 min-h-[300px] flex flex-col items-center justify-center relative">
            {#if isScanning}
                <div class="absolute inset-0 flex items-center justify-center">
                    <p class="text-white/70 animate-pulse">Camera Active (Mock)...</p>
                    <div class="absolute inset-x-12 inset-y-24 border-2 border-white/50 rounded-lg"></div>
                </div>
                <Button variant="secondary" size="sm" class="absolute bottom-4" on:click={toggleCamera}>
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
                    <Button on:click={toggleCamera}>
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
                        on:keydown={(e) => e.key === 'Enter' && handleScan(manualId)}
                    />
                </div>
                <Button on:click={() => handleScan(manualId)} disabled={!manualId}>
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

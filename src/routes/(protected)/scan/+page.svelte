<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Camera, QrCode, Search, CheckCircle2, X, Plus, MapPin as MapPinIcon, Maximize, Minimize, RefreshCcw, StopCircle, ScanLine } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { Avatar, AvatarImage } from "$lib/components/ui/avatar";
    import { ScrollArea } from "$lib/components/ui/scroll";
    import { onMount, onDestroy } from 'svelte';
    import { attendanceApi } from '$lib/api/attendance';
    import { supabase } from '$lib/supabase';
	import type { AttendanceEvent } from '$lib/types';
    import { Html5Qrcode } from "html5-qrcode";

    let manualId = $state("");
    let lastScanned = $state<{ id: string, name: string, timestamp: string } | null>(null);
    let isScanning = $state(false); // Controls camera UI visibility
    let activeEvent = $state<AttendanceEvent | null>(null);
    let isLoading = $state(true);

    // Camera State
    let scanner: Html5Qrcode | null = null;
    let cameras: any[] = [];
    let currentCameraIndex = 0;
    let isFullscreen = $state(false);
    let isProcessing = false;
    let scannerContainer: HTMLElement | undefined = $state();
    let isWideScan = $state(false); // false = Normal (250px), true = Wide (Full)

    /* Recently scanned members in this session */
    let recentScans = $state<{ id: string, name: string, time: string }[]>([]);

    onMount(async () => {
        await loadActiveEvent();
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    });

    function handleFullscreenChange() {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
             isFullscreen = false;
        }
    }

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

    function getQrBoxConfig() {
        if (typeof window === 'undefined') return { width: 250, height: 250 };
        
        if (isWideScan) {
             // Wide Mode: ~85% of screen width, rectangular-ish but large
             // This mimics "taking almost the whole camera"
             const w = Math.min(window.innerWidth * 0.85, 600);
             const h = Math.min(window.innerHeight * 0.6, 400); // Taller than typical rect
             return { width: Math.floor(w), height: Math.floor(h) };
        }
        // Normal Mode
        return { width: 250, height: 250 };
    }

    async function startScanner() {
        if (!activeEvent) {
             toast.error("No active event! Cannot start scanner.");
             return;
        }
        isScanning = true;
        // Wait for DOM to render the #reader div
        setTimeout(async () => {
             try {
                const elementId = window.innerWidth >= 768 ? "reader-desktop" : "reader-mobile";
                if (!scanner) {
                    // verbose: false
                    scanner = new Html5Qrcode(elementId, false);
                }
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length) {
                    cameras = devices;
                   
                    const backCam = cameras.find(c => c.label.toLowerCase().includes('back')) || cameras[0];
                    currentCameraIndex = cameras.indexOf(backCam);
                    
                    await scanner.start(
                        backCam.id, 
                        {
                            fps: 10,
                            qrbox: getQrBoxConfig(),
                            // aspectRatio: 1.0
                        },
                        (decodedText) => {
                             // Handle scan success
                             // Basic debounce/duplicate check is handled in handleScan's logic via toast or backend
                             handleScan(decodedText);
                        },
                        (errorMessage) => {
                            // ignore frame read errors
                        }
                    );
                } else {
                    toast.error("No cameras found on device.");
                    isScanning = false;
                }
             } catch (err) {
                 console.error(err);
                 toast.error("Camera access failed. Check permissions.");
                 isScanning = false;
             }
        }, 100);
    }

    async function stopScanner() {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
             await document.exitFullscreen().catch(e => console.error(e));
        }
        if (scanner) {
            try {
                if (scanner.isScanning) {
                    await scanner.stop();
                }
                scanner.clear();
            } catch (err) {
                console.error("Stop failed", err);
            } finally {
                scanner = null;
            }
        }
        isScanning = false;
        isFullscreen = false;
    }

    async function switchCamera() {
        if (!scanner || cameras.length < 2) return;
        
        try {
            await scanner.stop();
            currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
            await scanner.start(
                cameras[currentCameraIndex].id,
                { fps: 10, qrbox: getQrBoxConfig() },
                (decodedText) => handleScan(decodedText),
                () => {}
            );
        } catch (err) {
            toast.error("Failed to switch camera");
        }
    }

    function toggleFullscreen() {
        if (!scannerContainer) return;

        if (!isFullscreen) {
            if (scannerContainer.requestFullscreen) {
                scannerContainer.requestFullscreen();
            } else if ((scannerContainer as any).webkitRequestFullscreen) {
                (scannerContainer as any).webkitRequestFullscreen();
            }
            isFullscreen = true;
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            }
            isFullscreen = false;
        }
    }

    async function handleScan(id: string) {
        if (!id || isProcessing) return;
        if (!activeEvent) {
            toast.error("No active event found to scan into.");
            return;
        }

        isProcessing = true;
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
        } finally {
            // Delay buffer to prevent double-scan
            setTimeout(() => { isProcessing = false; }, 2000);
        }
    }

    function handleManualSubmit() {
        if (!manualId) return;
        handleScan(manualId);
    }

    function toggleCamera() {
        if (isScanning) {
            stopScanner();
        } else {
            startScanner();
        }
    }

    async function toggleScanSize() {
        if (!scanner) return;
        isWideScan = !isWideScan;
        
        // Need to restart scanner to apply new qrbox size
        if (scanner.isScanning) {
            try {
                await scanner.stop();
                await scanner.start(
                    cameras[currentCameraIndex].id,
                    {
                        fps: 10,
                        qrbox: getQrBoxConfig()
                    },
                    (decodedText) => handleScan(decodedText),
                    () => {}
                );
                const mode = isWideScan ? "Wide" : "Normal";
                toast.success(`Scan size set to ${mode}`);
            } catch (e) {
                console.error(e);
                toast.error("Failed to update scan size");
            }
        }
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
        if (recentScans.length > 0 || isFullscreen) document.body.classList.add('hide-mobile-nav');
        else document.body.classList.remove('hide-mobile-nav');
        return () => {
            if (typeof document !== 'undefined') document.body.classList.remove('hide-mobile-nav');
        };
    });

    onDestroy(() => {
        if (scanner) {
            try {
                if (scanner.isScanning) {
                    scanner.stop().catch(console.error);
                }
                scanner.clear();
            } catch (e) { console.error(e); }
        }
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
    <!-- Camera Scan card -->
    <div 
        bind:this={scannerContainer}
        class={isFullscreen ? "fixed inset-0 z-[100] bg-black flex flex-col justify-center items-center" : "rounded-2xl border-2 border-dashed border-border/40 overflow-hidden relative min-h-[300px] flex flex-col justify-center"}
    >
        
        {#if !isScanning}
            <div class="p-6 flex flex-col items-center gap-6">
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
        {:else}
             <!-- Scanner UI -->
             <div id="reader-mobile" class="w-full h-full bg-black"></div>
             
             <!-- Controls Overlay -->
             <div class="absolute bottom-8 left-0 right-0 flex justify-center gap-4 z-10 scan-controls">
                  <Button variant="outline" size="icon" class="h-10 w-10 rounded-xl bg-black/40 backdrop-blur-md border-white/20 text-white hover:bg-white/20" onclick={switchCamera}>
                      <RefreshCcw class="h-5 w-5" />
                  </Button>
                  <Button variant="destructive" size="icon" class="h-10 w-10 rounded-xl" onclick={stopScanner}>
                      <StopCircle class="h-5 w-5" />
                  </Button>
                  {#if isFullscreen}
                      <Button variant="outline" size="icon" class="h-10 w-10 rounded-xl bg-black/40 backdrop-blur-md border-white/20 text-white hover:bg-white/20" onclick={toggleScanSize}>
                          <ScanLine class="h-5 w-5" />
                      </Button>
                  {/if}
                  <Button variant="outline" size="icon" class="h-10 w-10 rounded-xl bg-black/40 backdrop-blur-md border-white/20 text-white hover:bg-white/20" onclick={toggleFullscreen}>
                      {#if isFullscreen}
                          <Minimize class="h-5 w-5" />
                      {:else}
                          <Maximize class="h-5 w-5" />
                      {/if}
                  </Button>
             </div>

              <!-- Overlay Text helper -->
              <div class="absolute top-4 left-0 right-0 text-center z-10 pointer-events-none">
                  <div class="inline-block px-4 py-2 rounded-full bg-black/50 backdrop-blur text-white text-xs font-medium border border-white/10">
                      Scan QR Code
                  </div>
              </div>
        {/if}
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
        <div class="rounded-2xl border-2 border-dashed border-(--stat-success)/20 p-16 flex items-center justify-center flex-1 min-h-0 bg-card/5 relative overflow-hidden">
                {#if isScanning}
                    <div id="reader-desktop" class="w-full h-full bg-black min-h-100"></div>
                    <!-- Controls -->
                    <div class="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-10">
                        <Button variant="destructive" size="lg" class="rounded-full shadow-xl" onclick={stopScanner}>
                             <StopCircle class="mr-2 h-5 w-5" /> Stop Scanning
                        </Button>
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
    
    /* Force Video to fill container properly */
    :global(#reader-mobile video) {
        object-fit: cover;
        width: 100% !important;
        height: 100% !important;
        border-radius: inherit;
    }
    
    :global(#reader-desktop video) {
        object-fit: cover;
        width: 100% !important;
        height: 100% !important;
        border-radius: inherit;
    }
</style>


<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import QRCode from 'qrcode';
    import { Loader2, Monitor } from 'lucide-svelte';

    const eventId = $page.params.eventId;
    let event = $state<any>(null);
    let loading = $state(true);
    let qrCodeDataUrl = $state('');

    onMount(async () => {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('event_id', eventId)
                .single();
            
            if (error) throw error;
            event = data;

            // Generate QR Code
            const url = `${window.location.origin}/check-in/${eventId}`;
            qrCodeDataUrl = await QRCode.toDataURL(url, { 
                width: 800, 
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });
        } catch (err) {
            console.error('Display Error:', err);
        } finally {
            loading = false;
        }
    });

    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
</script>

<svelte:head>
    <title>Check-in Display | {event?.event_name || 'Loading...'}</title>
</svelte:head>

<div class="fixed inset-0 bg-white overflow-hidden font-sans select-none">
    <!-- Background Image -->
    <div class="absolute inset-0 z-0">
        <img 
            src="/Background.png" 
            alt="Church Background" 
            class="w-full h-full object-cover" 
        />
    </div>

    {#if loading}
        <div class="relative z-10 flex h-full items-center justify-center">
            <Loader2 class="h-12 w-12 animate-spin text-primary" />
        </div>
    {:else if event}
        <div class="relative z-10 flex h-full items-center justify-center p-8 md:p-16">
            <div class="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-8 lg:gap-24 items-center w-full max-w-[1800px]">
                
                <!-- Left Side: QR Code (White box with green border) -->
                <div class="flex justify-center lg:justify-start">
                    <div class="bg-white p-6 md:p-10 rounded-[40px] border-[3px] border-[#275032] shadow-2xl">
                        {#if qrCodeDataUrl}
                            <img src={qrCodeDataUrl} alt="Check-in QR" class="w-full max-w-120 lg:max-w-160 xl:max-w-180" />
                        {/if}
                    </div>
                </div>

                <!-- Right Side: Text Content (Following the provided layout exactly) -->
                <div class="flex flex-col text-left space-y-4 lg:space-y-6 text-black">
                    <div class="space-y-4">
                        <h2 class="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight whitespace-nowrap">
                            WE'RE GLAD YOU ARE HERE!
                        </h2>
                        <div class="h-[3px] w-full bg-black/60"></div>
                    </div>

                    <div class="space-y-2">
                        <p class="text-xl md:text-2xl lg:text-3xl font-semibold tracking-wide whitespace-nowrap">
                            IF YOU HAVEN'T TAKEN ATTENDANCE YET,
                        </p>
                        <h1 class="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-none whitespace-nowrap">
                            PLEASE SCAN THIS QR CODE
                        </h1>
                        <h3 class="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight whitespace-nowrap">
                            TO CHECK IN FOR TODAY'S SERVICE
                        </h3>
                    </div>

                    <div class="pt-4">
                        <div class="h-[3px] w-full bg-black/60"></div>
                        <div class="mt-6 space-y-1 text-xl md:text-2xl lg:text-4xl font-medium">
                            <p>For Assistance,</p>
                            <p>Please proceed to the QR Booth</p>
                            <p>at the 2nd floor.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <div class="relative z-10 flex h-full flex-col items-center justify-center p-8 text-center">
            <h1 class="text-3xl font-bold">Event not found</h1>
            <button onclick={() => history.back()} class="mt-4 text-primary underline">Go back</button>
        </div>
    {/if}

    <!-- Bottom Controls (Floating) -->
    <div class="absolute bottom-6 right-6 z-20 flex gap-2 opacity-20 hover:opacity-100 transition-opacity">
        <button 
            onclick={toggleFullScreen}
            class="p-3 bg-black/10 hover:bg-black/20 rounded-full backdrop-blur-md"
            title="Toggle Fullscreen"
        >
            <Monitor class="h-6 w-6" />
        </button>
    </div>
</div>

<style>
    /* Prevent scrollbars in display mode */
    :global(body) {
        overflow: hidden !important;
    }
</style>

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
			const url = `https://check-in-bbct.vercel.app/check-in/${eventId}`;
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

<div class="fixed inset-0 overflow-hidden bg-white font-sans select-none">
	<!-- Background Image -->
	<div class="absolute inset-0 z-0">
		<img src="/Background.png" alt="Church Background" class="h-full w-full object-cover" />
	</div>

	{#if loading}
		<div class="relative z-10 flex h-full items-center justify-center">
			<Loader2 class="h-12 w-12 animate-spin text-primary" />
		</div>
	{:else if event}
		<div class="relative z-10 flex h-full items-center justify-center p-8 md:p-16">
			<div
				class="grid w-full max-w-[1800px] grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-24"
			>
				<!-- Left Side: QR Code (White box with green border) -->
				<div class="flex justify-center lg:justify-start">
					<div class="rounded-[40px] border-[3px] border-[#275032] bg-white p-6 shadow-2xl md:p-10">
						{#if qrCodeDataUrl}
							<img
								src={qrCodeDataUrl}
								alt="Check-in QR"
								class="w-full max-w-120 lg:max-w-160 xl:max-w-180"
							/>
						{/if}
					</div>
				</div>

				<!-- Right Side: Text Content (Following the provided layout exactly) -->
				<div class="flex flex-col space-y-4 text-left text-black lg:space-y-6">
					<div class="space-y-4">
						<h2 class="text-4xl font-bold tracking-tight whitespace-nowrap md:text-5xl lg:text-6xl">
							WE'RE GLAD YOU ARE HERE!
						</h2>
						<div class="h-[3px] w-full bg-black/60"></div>
					</div>

					<div class="space-y-2">
						<p
							class="text-xl font-semibold tracking-wide whitespace-nowrap md:text-2xl lg:text-3xl"
						>
							IF YOU HAVEN'T TAKEN ATTENDANCE YET,
						</p>
						<h1
							class="text-4xl leading-none font-black tracking-tight whitespace-nowrap md:text-5xl lg:text-6xl"
						>
							PLEASE SCAN THIS QR CODE
						</h1>
						<h3 class="text-3xl font-bold tracking-tight whitespace-nowrap md:text-4xl lg:text-5xl">
							TO CHECK IN FOR TODAY'S SERVICE
						</h3>
					</div>

					<div class="pt-4">
						<div class="h-[3px] w-full bg-black/60"></div>
						<div class="mt-6 space-y-1 text-xl font-medium md:text-2xl lg:text-4xl">
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
	<div
		class="absolute right-6 bottom-6 z-20 flex gap-2 opacity-20 transition-opacity hover:opacity-100"
	>
		<button
			onclick={toggleFullScreen}
			class="rounded-full bg-black/10 p-3 backdrop-blur-md hover:bg-black/20"
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

<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Loader2, Camera, CheckCircle2, XCircle, Search, QrCode } from 'lucide-svelte';
	import { Html5Qrcode } from 'html5-qrcode';
	import { toast } from 'svelte-sonner';
	import type { AttendanceEvent } from '$lib/types';
	import { goto } from '$app/navigation';

	const eventId = $page.params.eventId;
	let event = $state<AttendanceEvent | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let memberId = $state('');
	let checkingIn = $state(false);
	let checkInStatus = $state<'idle' | 'success' | 'error' | 'already_checked_in'>('idle');
	let statusMessage = $state('');

	// Scanner State
	let isScanning = $state(false);
	let scanner: Html5Qrcode | null = null;
	let scannerContainerId = 'reader';

	onMount(async () => {
		try {
			// Fetch Event Details
			const { data, error: err } = await supabase
				.from('events')
				.select('*')
				.eq('event_id', eventId)
				.single();

			if (err) throw err;
			event = data;

			if (event && event.status === 'completed') {
				error = 'This event has ended.';
			}
		} catch (err: any) {
			console.error(err);
			error = 'Event not found or invalid.';
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		stopScanner();
	});

	async function startScanner() {
		isScanning = true;
		// Wait for DOM
		setTimeout(async () => {
			try {
				scanner = new Html5Qrcode(scannerContainerId);
				await scanner.start(
					{ facingMode: 'environment' },
					{
						fps: 10,
						qrbox: { width: 250, height: 250 }
					},
					onScanSuccess,
					(errorMessage) => {
						// Parse error, ignore common ones
					}
				);
			} catch (err) {
				console.error('Failed to start scanner', err);
				toast.error('Could not start camera. Please ensure permissions are granted.');
				isScanning = false;
			}
		}, 100);
	}

	async function stopScanner() {
		if (scanner && scanner.isScanning) {
			await scanner.stop();
			scanner.clear();
		}
		isScanning = false;
		scanner = null;
	}

	function onScanSuccess(decodedText: string, decodedResult: any) {
		stopScanner();
		memberId = decodedText;
		handleCheckIn();
	}

	async function handleCheckIn() {
		if (!memberId || !event) return;

		checkingIn = true;
		checkInStatus = 'idle';
		statusMessage = '';

		try {
			// Use RPC function for security (prevents searching members table directly)
			const { data, error: rpcErr } = await supabase.rpc('self_check_in', {
				p_member_id: memberId,
				p_event_id: event.event_id
			});

			if (rpcErr) {
				// Fallback error handling
				console.error('RPC Error:', rpcErr);
				throw rpcErr;
			}

			if (data && data.success) {
				checkInStatus = 'success';
				statusMessage = data.message;
				memberId = ''; // Reset input
			} else {
				checkInStatus = 'error';
				statusMessage = data?.message || 'Check-in failed.';
			}

		} catch (err: any) {
			console.error(err);
			checkInStatus = 'error';
			statusMessage = 'Unable to check in. Please ensure the system SQL update has been run.';
		} finally {
			checkingIn = false;
		}
	}
</script>

<div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
	<div class="max-w-md w-full">
		{#if loading}
			<div class="flex justify-center p-8">
				<Loader2 class="h-8 w-8 animate-spin text-primary" />
			</div>
		{:else if error}
			<Card class="border-red-200">
				<CardHeader>
					<div class="flex items-center gap-2 text-red-600">
						<XCircle class="h-6 w-6" />
						<CardTitle>Error</CardTitle>
					</div>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
			</Card>
		{:else if event}
			<Card class="shadow-lg border-t-4 border-t-primary">
				<CardHeader class="text-center pb-2">
					<Badge variant="outline" class="mx-auto mb-2 capitalize">{event.status}</Badge>
					<CardTitle class="text-2xl">{event.event_name}</CardTitle>
					<CardDescription>
						{new Date(event.event_date).toLocaleDateString()}
					</CardDescription>
				</CardHeader>

				<CardContent class="space-y-6">
					{#if checkInStatus === 'success'}
						<div class="bg-green-50 text-green-700 p-4 rounded-lg flex flex-col items-center animate-in fade-in zoom-in duration-300">
							<CheckCircle2 class="h-12 w-12 mb-2" />
							<h3 class="text-lg font-bold">Checked In!</h3>
							<p>{statusMessage}</p>
							<Button variant="outline" class="mt-4" onclick={() => checkInStatus = 'idle'}>
								Scan Another
							</Button>
						</div>
					{:else}
						<!-- Scanner Section -->
						{#if isScanning}
							<div class="relative bg-black rounded-xl overflow-hidden border shadow-inner aspect-[4/5] sm:aspect-square">
								<div id={scannerContainerId} class="w-full h-full"></div>
								<Button 
									variant="destructive" 
									size="sm" 
									class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 shadow-lg"
									onclick={stopScanner}
								>
									Stop Camera
								</Button>
							</div>
						{:else}
							<div class="flex flex-col gap-3">
								<Button size="lg" class="w-full py-8 text-lg gap-2" onclick={startScanner}>
									<Camera class="h-6 w-6" />
									Scan Your ID Badge
								</Button>
								
								<div class="relative">
									<div class="absolute inset-0 flex items-center">
										<span class="w-full border-t"></span>
									</div>
									<div class="relative flex justify-center text-xs uppercase">
										<span class="bg-background px-2 text-muted-foreground">Or enter ID manually</span>
									</div>
								</div>

								<form class="flex flex-col gap-3" onsubmit={(e) => { e.preventDefault(); handleCheckIn(); }}>
									<div class="grid gap-2">
										<Label for="memberId" class="sr-only">Member ID</Label>
										<Input 
											id="memberId" 
											placeholder="Enter Member ID" 
											bind:value={memberId}
											class="text-center text-lg h-12"
										/>
									</div>
									<Button type="submit" disabled={!memberId || checkingIn}>
										{checkingIn ? 'Checking in...' : 'Check In'}
									</Button>
								</form>
							</div>
						{/if}

						{#if checkInStatus === 'error'}
							<div class="mt-4 rounded-md bg-destructive/15 p-4 text-destructive">
								<div class="flex items-center gap-2">
									<XCircle class="h-4 w-4" />
									<h5 class="font-medium leading-none tracking-tight">Error</h5>
								</div>
								<div class="mt-1 text-sm opacity-90">{statusMessage}</div>
							</div>
						{/if}
					{/if}
				</CardContent>
				<CardFooter class="flex flex-col items-center justify-center text-center gap-1 pb-6">
					<div class="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
						Bible Baptist Church Tanza
					</div>
					<div class="text-xs text-muted-foreground/80">
						QR Attendance V2 - Self Check In System
					</div>
				</CardFooter>
			</Card>
		{/if}
	</div>
</div>

<style>
	/* Fix html5-qrcode video responsiveness */
	:global(#reader) {
		border: none !important;
		position: absolute !important;
		top: 50% !important;
		left: 50% !important;
		transform: translate(-50%, -50%) !important;
		width: 100% !important;
		height: 100% !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
		overflow: hidden !important;
	}

	:global(#reader video) {
		min-width: 100% !important;
		min-height: 100% !important;
		width: auto !important;
		height: auto !important;
		object-fit: cover !important;
	}

	/* Hide default library UI */
	:global(#reader__dashboard_section_csr),
	:global(#reader__header_message),
	:global(#reader img) {
		display: none !important;
	}

	:global(#reader__scan_region) {
		width: 100% !important;
		height: 100% !important;
		display: flex !important;
		justify-content: center !important;
		align-items: center !important;
	}
</style>

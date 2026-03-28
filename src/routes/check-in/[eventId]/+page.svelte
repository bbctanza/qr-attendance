<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription,
		CardFooter
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Loader2, Camera, CheckCircle2, XCircle, Search, QrCode } from 'lucide-svelte';
	import { Html5Qrcode } from 'html5-qrcode';
	import { toast } from 'svelte-sonner';
	import type { AttendanceEvent } from '$lib/types';
	import { goto } from '$app/navigation';
	import { sanitizeText, sanitizeErrorMessage, sanitizeId } from '$lib/utils/security';

	const eventId = $page.params.eventId;
	let event = $state<AttendanceEvent | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let memberId = $state('');
	let checkingIn = $state(false);
	let checkInStatus = $state<'idle' | 'success' | 'error' | 'already_checked_in'>('idle');
	let statusMessage = $state('');

	// Modal State
	let showInstructions = $state(false);

	// Scanner State
	let isScanning = $state(false);
	let scanner: Html5Qrcode | null = null;
	let scannerContainerId = 'reader';

	// Audio beep function
	function playBeep(frequency = 800, duration = 200) {
		try {
			const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
			const oscillator = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(audioContext.destination);

			oscillator.frequency.value = frequency;
			oscillator.type = 'sine';

			gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

			oscillator.start(audioContext.currentTime);
			oscillator.stop(audioContext.currentTime + duration / 1000);
		} catch (err) {
			console.error('Beep error:', err);
		}
	}

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

				// Try different constraint combinations to handle various browsers
				const constraintOptions = [
					// Option 1: Rear camera (primary for mobile)
					{ facingMode: 'environment' },
					// Option 2: No facingMode constraints (Firefox fallback)
					{ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
					// Option 3: Minimal constraints (most compatible)
					{ audio: false, video: true },
					// Option 4: Absolute minimal (last resort)
					{}
				];

				let success = false;
				for (const constraints of constraintOptions) {
					try {
						console.log('Trying camera with constraints:', constraints);
						await scanner.start(
							constraints,
							{
								fps: 10,
								qrbox: { width: 250, height: 250 }
							},
							onScanSuccess,
							(errorMessage) => {
								// Suppress individual scan errors
							}
						);
						success = true;
						console.log('Camera started successfully with constraints:', constraints);
						break;
					} catch (constraintErr: any) {
						console.warn('Constraints failed, trying next option:', constraintErr.message);
						// Continue to next constraint option
					}
				}

				if (!success) {
					throw new Error('All camera constraint options failed');
				}
			} catch (err: any) {
				console.error('Failed to start scanner:', err);
				let errorMsg = 'Could not start camera. ';

				if (err.message?.includes('NotAllowedError') || err.name === 'NotAllowedError') {
					errorMsg =
						'Camera permission denied. Please enable camera access in your browser settings.';
				} else if (err.message?.includes('NotFoundError') || err.name === 'NotFoundError') {
					errorMsg = 'No camera found. Please ensure your device has a camera.';
				} else if (err.message?.includes('NotSupportedError') || err.name === 'NotSupportedError') {
					errorMsg =
						'Your browser does not support camera access. Please use a modern browser like Chrome or Safari.';
				} else if (err.message?.includes('AbortError') || err.name === 'AbortError') {
					errorMsg = 'Camera access was aborted. Please refresh the page and try again.';
				} else {
					errorMsg +=
						'Ensure:\n1. Camera permission is granted\n2. Camera is not in use elsewhere\n3. Using HTTPS or localhost\n4. Browser supports camera access';
				}

				toast.error(errorMsg);
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
		playBeep(); // Play beep on successful scan
		stopScanner();
		// Sanitize scanned data to prevent injection attacks
		memberId = sanitizeId(decodedText);
		handleCheckIn();
	}

	async function handleCheckIn() {
		if (!memberId || !event) return;

		checkingIn = true;
		checkInStatus = 'idle';
		statusMessage = '';

		try {
			// Sanitize memberId to prevent injection attacks
			const sanitizedMemberId = sanitizeId(memberId);
			if (!sanitizedMemberId) {
				statusMessage = 'Invalid member ID format.';
				checkInStatus = 'error';
				return;
			}

			// Use RPC function for security (prevents searching members table directly)
			const { data, error: rpcErr } = await supabase.rpc('self_check_in', {
				p_member_id: sanitizedMemberId,
				p_event_id: event.event_id
			});

			if (rpcErr) {
				// Fallback error handling
				console.error('RPC Error:', rpcErr);
				throw rpcErr;
			}

			if (data && data.success) {
				playBeep(1000, 150); // Higher pitch beep for success
				setTimeout(() => playBeep(1000, 150), 150); // Double beep
				checkInStatus = 'success';
				// Sanitize the success message from RPC
				statusMessage = sanitizeText(data.message, 200);
				memberId = ''; // Reset input
			} else {
				playBeep(400, 300); // Lower pitch beep for error
				checkInStatus = 'error';
				// Sanitize the error message from RPC
				statusMessage = sanitizeText(data?.message || 'Check-in failed.', 200);
			}
		} catch (err: any) {
			console.error(err);
			playBeep(400, 300); // Error beep
			checkInStatus = 'error';
			// Sanitize error message to prevent information disclosure
			statusMessage = sanitizeErrorMessage(err);
		} finally {
			checkingIn = false;
		}
	}
</script>

<div class="relative flex min-h-screen items-center justify-center p-4">
	<!-- Background Image -->
	<div class="absolute inset-0 z-0">
		<img src="/Background.png" alt="Background" class="h-full w-full object-cover opacity-100" />
		<!-- White overlay to ensure form readability -->
		<div class="absolute inset-0 bg-white/60 backdrop-blur-[2px]"></div>
	</div>

	<div class="relative z-10 w-full max-w-md">
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
			<Card class="border-t-4 border-t-primary shadow-lg">
				<CardHeader class="pb-2 text-center">
					<Badge variant="outline" class="mx-auto mb-2 capitalize">{event.status}</Badge>
					<CardTitle class="text-2xl">{event.event_name}</CardTitle>
					<CardDescription>
						{new Date(event.event_date).toLocaleDateString()}
					</CardDescription>
				</CardHeader>

				<CardContent class="space-y-6">
					{#if checkInStatus === 'success'}
						<div
							class="flex animate-in flex-col items-center rounded-lg bg-green-50 p-4 text-green-700 duration-300 fade-in zoom-in"
						>
							<CheckCircle2 class="mb-2 h-12 w-12" />
							<h3 class="text-lg font-bold">Checked In!</h3>
							<p>{statusMessage}</p>
							<Button variant="outline" class="mt-4" onclick={() => (checkInStatus = 'idle')}>
								Scan Another
							</Button>
						</div>
					{:else}
						<!-- Scanner Section -->
						{#if isScanning}
							<div
								class="relative aspect-4/5 overflow-hidden rounded-xl border bg-black shadow-inner sm:aspect-square"
							>
								<div id={scannerContainerId} class="h-full w-full"></div>
								<Button
									variant="destructive"
									size="sm"
									class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 shadow-lg"
									onclick={stopScanner}
								>
									Stop Camera
								</Button>
							</div>
						{:else}
							<div class="flex flex-col gap-3">
								<Button size="lg" class="w-full gap-2 py-8 text-lg" onclick={startScanner}>
									<Camera class="h-6 w-6" />
									Scan Your ID Badge
								</Button>

								<div class="relative">
									<div class="absolute inset-0 flex items-center">
										<span class="w-full border-t"></span>
									</div>
									<div class="relative flex justify-center text-xs uppercase">
										<span class="bg-background px-2 text-muted-foreground"
											>Or enter ID manually</span
										>
									</div>
								</div>

								<form
									class="flex flex-col gap-3"
									onsubmit={(e) => {
										e.preventDefault();
										handleCheckIn();
									}}
								>
									<div class="grid gap-2">
										<Label for="memberId" class="sr-only">Member ID</Label>
										<Input
											id="memberId"
											placeholder="Enter Member ID"
											bind:value={memberId}
											class="h-12 text-center text-lg"
										/>
									</div>
									<Button
										type="submit"
										size="lg"
										class="w-full py-3"
										disabled={!memberId || checkingIn}
									>
										{checkingIn ? 'Checking in...' : 'Check In'}
									</Button>
								</form>
							</div>
						{/if}

						{#if checkInStatus === 'error'}
							<div class="mt-4 rounded-md bg-destructive/15 p-4 text-destructive">
								<div class="flex items-center gap-2">
									<XCircle class="h-4 w-4" />
									<h5 class="leading-none font-medium tracking-tight">Error</h5>
								</div>
								<div class="mt-1 text-sm opacity-90">{statusMessage}</div>
							</div>
						{/if}
					{/if}
				</CardContent>
				<CardFooter class="flex flex-col items-center justify-center gap-3 pb-6 text-center">
					<Button variant="outline" class="w-full" onclick={() => (showInstructions = true)}>
						How to Check In?
					</Button>
					<div class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
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

<!-- Instructions Modal -->
<Dialog.Root bind:open={showInstructions}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="pointer-events-none fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
		/>
		<Dialog.Content
			class="pointer-events-auto fixed top-[50%] left-[50%] z-50 grid max-h-[90vh] w-[95vw] max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-xl border bg-card p-4 shadow-lg duration-200 sm:p-6"
		>
			<Dialog.Header>
				<Dialog.Title class="text-lg font-semibold sm:text-xl">How to Check In</Dialog.Title>
				<Dialog.Description class="text-xs text-muted-foreground sm:text-sm">
					Follow these simple steps to check in for the event
				</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4">
				<div class="flex gap-3">
					<div class="flex shrink-0 items-start">
						<div
							class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
						>
							1
						</div>
					</div>
					<div>
						<h4 class="text-sm font-semibold">Scan Your ID Badge</h4>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
							Tap the "Scan Your ID Badge" button to activate the camera and scan your QR code
							badge.
						</p>
					</div>
				</div>

				<div class="flex gap-3">
					<div class="flex shrink-0 items-start">
						<div
							class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
						>
							2
						</div>
					</div>
					<div>
						<h4 class="text-sm font-semibold">Position Your Badge</h4>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
							Hold your ID badge in front of the camera until it scans successfully. You'll hear a
							beep when it's detected.
						</p>
					</div>
				</div>

				<div class="flex gap-3">
					<div class="flex shrink-0 items-start">
						<div
							class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
						>
							3
						</div>
					</div>
					<div>
						<h4 class="text-sm font-semibold">Manual Entry (Optional)</h4>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
							If scanning doesn't work, you can manually enter your Member ID in the input field and
							tap "Check In".
						</p>
					</div>
				</div>

				<div class="flex gap-3">
					<div class="flex shrink-0 items-start">
						<div
							class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
						>
							4
						</div>
					</div>
					<div>
						<h4 class="text-sm font-semibold">Confirmation</h4>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
							Once checked in successfully, you'll see a green confirmation message. You can then
							scan another badge or exit.
						</p>
					</div>
				</div>

				<div class="mt-4 rounded-lg border border-primary/20 bg-primary/10 p-3">
					<p class="text-xs font-medium text-primary sm:text-sm">
						💡 Tip: Make sure the lighting is good and hold your badge steady for faster scanning.
					</p>
				</div>
			</div>

			<Dialog.Header class="flex-row justify-end gap-2 space-y-0">
				<Button variant="outline" onclick={() => (showInstructions = false)} class="w-full">
					Got it!
				</Button>
			</Dialog.Header>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

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
		transform: scaleX(-1) !important;
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

	:global(#reader canvas) {
		transform: scaleX(-1) !important;
	}
</style>

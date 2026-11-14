<script lang="ts">
	import { Html5Qrcode } from 'html5-qrcode';
	import { CameraOff, Loader2, ArrowUp, ArrowDown } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import { kiosk } from '$lib/kiosk/state.svelte';

	/**
	 * Camera QR scanning — the one feature PLAN.md section 7 left undecided, between a Rust
	 * pipeline (`nokhwa` + `rxing`) and `getUserMedia` inside the webview.
	 *
	 * Settled for the webview, for two reasons: the main system already does it this way with
	 * `html5-qrcode`, so both apps decode identically and a fix in one is a fix in the other;
	 * and it keeps the Rust surface to the shell, which is the whole architecture of this port.
	 *
	 * Decoded text goes straight to `kiosk.submit()`, the same entry point the USB scanner
	 * uses — so the debounce window, the scan chain, the offline queue and the result card all
	 * behave identically no matter which input read the code. The camera fires on *every*
	 * decoded frame, several times a second, which is exactly what that debounce is for.
	 */
	const ELEMENT_ID = 'kiosk-camera-reader';

	let scanner: Html5Qrcode | null = null;
	let starting = $state(true);
	let error = $state<string | null>(null);

	/** Once live the frame disappears, exactly as the web app drops to `border-0 p-0`. */
	const live = $derived(!starting && !error);

	/**
	 * The web app shows its guide once the camera has been idle for `cameraGuideIdleTime`
	 * seconds (0 = always). Tracked off the checked-in count, which is the signal this
	 * component has that a scan actually landed.
	 */
	let idleSeconds = $state(0);
	const guideVisible = $derived(
		live &&
			kiosk.settings.cameraGuidePosition !== 'off' &&
			(kiosk.settings.cameraGuideIdleTime === 0 ||
				idleSeconds >= kiosk.settings.cameraGuideIdleTime)
	);

	$effect(() => {
		const id = setInterval(() => (idleSeconds += 1), 1000);
		return () => clearInterval(id);
	});

	$effect(() => {
		// A scan resets the idle clock, hiding the guide again.
		kiosk.activeEvent?.checked_in;
		idleSeconds = 0;
	});

	/**
	 * Scan box, copied from the web app's `getQrBoxConfig()`: 250x250 normally, and a large
	 * rectangle in wide mode, capped so it never exceeds the viewport.
	 */
	function qrbox() {
		if (!kiosk.settings.cameraWideScan) return { width: 250, height: 250 };
		return {
			width: Math.floor(Math.min(window.innerWidth * 0.85, 600)),
			height: Math.floor(Math.min(window.innerHeight * 0.6, 400))
		};
	}

	async function start() {
		starting = true;
		error = null;

		try {
			const devices = await Html5Qrcode.getCameras();
			if (!devices || devices.length === 0) {
				error = 'No camera found on this device.';
				starting = false;
				return;
			}

			// The chosen camera if it is still present, else the web app's preference: a rear
			// camera when the device has one. A camera that was unplugged must not leave the
			// kiosk refusing to scan.
			const chosen =
				devices.find((d) => d.id === kiosk.settings.cameraId) ??
				devices.find((d) => d.label.toLowerCase().includes('back')) ??
				devices[0];

			scanner = new Html5Qrcode(ELEMENT_ID, false);
			await scanner.start(
				chosen.id,
				{ fps: 10, qrbox: qrbox() },
				(decodedText) => kiosk.submit(decodedText),
				() => {
					// Frame read errors fire constantly while nothing is in view. Ignored on
					// purpose - they are the normal resting state of a camera, not a fault.
				}
			);
			starting = false;
		} catch (e) {
			console.error('[camera] could not start', e);
			// A refused permission is the common case on a fresh device, and it is the operator
			// who has to fix it, so the message says what to do rather than what threw.
			error =
				e instanceof Error && /permission|denied|notallowed/i.test(e.message)
					? 'Camera access was refused. Allow it for this app, then switch the camera back on.'
					: 'The camera could not be started. The USB scanner still works.';
			starting = false;
		}
	}

	async function stop() {
		const instance = scanner;
		scanner = null;
		if (!instance) return;
		try {
			// isScanning guards a stop() on an instance that never started, which throws.
			if (instance.isScanning) await instance.stop();
			instance.clear();
		} catch (e) {
			console.error('[camera] could not stop cleanly', e);
		}
	}

	/**
	 * Restart when the chosen camera or scan box changes - html5-qrcode fixes both at start(),
	 * so they cannot be changed on a running scanner.
	 */
	$effect(() => {
		// Read first, so the effect tracks them.
		kiosk.settings.cameraId;
		kiosk.settings.cameraWideScan;

		void start();
		return () => void stop();
	});
</script>

<!-- Fullscreen mirrors the web app's `toggleFullscreen()`: the feed fills the screen on black,
	 which is the only way to line a code up from across a doorway. -->
<div
	class="flex min-h-0 w-full flex-1 flex-col {kiosk.settings.cameraFullscreen
		? 'fixed inset-0 z-40 bg-black'
		: ''}"
>
	<div
		class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden
			transition-[border-width,padding] duration-200
			{kiosk.settings.cameraFullscreen ? 'rounded-none' : 'rounded-2xl'}
			{live
			? 'border-0 bg-black p-0'
			: 'border-2 border-dashed border-stat-success/20 bg-card/5 p-10'}"
	>
		<!-- html5-qrcode injects the <video> in here; the global rules below are what make it
			 cover the box rather than letterbox inside it. -->
		<div id={ELEMENT_ID} class="size-full {kiosk.settings.cameraMirrored ? 'mirror' : ''}"></div>

		{#if starting}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
				<Loader2 class="size-8 animate-spin text-stat-success" aria-hidden="true" />
				<span class="text-base text-muted-foreground">Starting camera…</span>
			</div>
		{:else if error}
			<div
				class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center"
			>
				<CameraOff class="size-10 text-muted-foreground" aria-hidden="true" />
				<p class="max-w-md text-base text-muted-foreground">{error}</p>
			</div>
		{/if}

		<!-- The web app's own guide: a bouncing arrow and a pill reading "Show your QR code here",
			 positioned from the same cameraGuidePosition setting. This is the part a stranger at a
			 door actually reads - it says where to hold the code, which no frame around the feed
			 manages to communicate on its own. -->
		{#if guideVisible}
			<div
				transition:fly={{ y: kiosk.settings.cameraGuidePosition === 'top' ? -20 : 20, duration: 300 }}
				class="pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 flex-col
					items-center gap-2 {kiosk.settings.cameraGuidePosition === 'top'
					? 'top-6'
					: 'bottom-10'}"
			>
				{#if kiosk.settings.cameraGuidePosition === 'top'}
					<ArrowUp class="size-8 animate-bounce text-primary drop-shadow-md" aria-hidden="true" />
				{/if}
				<div
					class="rounded-full bg-primary/90 px-6 py-3 text-sm font-bold text-white shadow-xl
						ring-2 ring-white/20 backdrop-blur"
				>
					Show your QR code here
				</div>
				{#if kiosk.settings.cameraGuidePosition === 'bottom'}
					<ArrowDown class="size-8 animate-bounce text-primary drop-shadow-md" aria-hidden="true" />
				{/if}
			</div>
		{/if}
	</div>
</div>
<style>
	/*
	 * html5-qrcode injects its own DOM and sizes the <video> to the camera stream, which
	 * letterboxes it inside the container - that was the black strip down the right-hand side.
	 * These are the web app's `#reader-desktop video` rules, plus the wrapper the library puts
	 * between the container and the video, which the web app never had to override because its
	 * scanner box happened to match the stream's aspect.
	 */
	:global(#kiosk-camera-reader),
	:global(#kiosk-camera-reader > div) {
		width: 100% !important;
		height: 100% !important;
	}

	:global(#kiosk-camera-reader video) {
		width: 100% !important;
		height: 100% !important;
		object-fit: cover;
		border-radius: inherit;
	}

	/*
	 * The library's shaded scan region is deliberately LEFT VISIBLE: the web app shows it, and
	 * it is what makes this read as a scanner rather than a webcam. It looked broken earlier
	 * only because the video was letterboxed, so the box sat over the black bars instead of
	 * over the picture. With cover-fit above it lines up.
	 */

	/* Same approach as the web app's `.mirror-camera`: flip the injected element, since the
	   video is created by the library rather than by this component. */
	.mirror :global(video),
	.mirror :global(canvas) {
		transform: scaleX(-1);
	}
</style>

<script lang="ts">
	import {
		Usb,
		Camera,
		Volume2,
		VolumeX,
		RefreshCw,
		Lock,
		FlipHorizontal,
		ScanLine,
		SwitchCamera,
		Maximize,
		Minimize,
		X,
		Bell,
		Check
	} from '@lucide/svelte';
	import { Html5Qrcode } from 'html5-qrcode';
	import { fly } from 'svelte/transition';
	import { kiosk } from '$lib/kiosk/state.svelte';
	import { playAccepted } from '$lib/kiosk/beep';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import * as Select from '$lib/components/ui/select';

	/**
	 * The controls staff actually touch during an event — and the whole point of them is that
	 * they need no password.
	 *
	 * Switching the scanner used to cost a long press, a password, a section change, a toggle,
	 * a Save and a Back: six actions for what the web app does in one tap. Nothing here can
	 * lose a scan, change who scans are recorded as, or leave kiosk mode, so the lock belongs
	 * on the other half of the settings, not on this.
	 *
	 * Every control applies instantly and persists itself. There is deliberately no Save — a
	 * draft is right for configuration and wrong for a switch flipped while someone waits.
	 */
	let { open = $bindable(false), onsettings }: { open?: boolean; onsettings: () => void } = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let cameras = $state<{ id: string; label: string }[]>([]);
	let testing = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	/**
	 * Only ever listed while the camera is already running, so this never raises a permission
	 * prompt on a device nobody is standing at.
	 */
	$effect(() => {
		if (open && kiosk.inputMode === 'camera' && cameras.length === 0) {
			void (async () => {
				try {
					const found = await Html5Qrcode.getCameras();
					cameras = found.map((d) => ({ id: d.id, label: d.label || 'Camera' }));
				} catch {
					cameras = [];
				}
			})();
		}
	});

	const muted = $derived(kiosk.settings.beepVolume === 0);
	let volumeBeforeMute = 70;

	function toggleMute() {
		if (muted) {
			kiosk.applyOperational({ beepVolume: volumeBeforeMute || 70 });
		} else {
			volumeBeforeMute = kiosk.settings.beepVolume;
			kiosk.applyOperational({ beepVolume: 0 });
		}
	}

	/**
	 * Cycle to the next camera, as the web app's `switchCamera()` does. Changing `cameraId`
	 * is enough - camera-scanner.svelte restarts the decoder when it changes, because
	 * html5-qrcode fixes the device at start().
	 */
	function switchCamera() {
		if (cameras.length < 2) return;
		const current = cameras.findIndex((c) => c.id === kiosk.settings.cameraId);
		const next = cameras[(current + 1 + cameras.length) % cameras.length];
		kiosk.applyOperational({ cameraId: next.id });
	}

	function runTest() {
		playAccepted();
		testing = true;
		setTimeout(() => (testing = false), 1600);
	}

	const cameraLabel = $derived(
		cameras.find((c) => c.id === kiosk.settings.cameraId)?.label ?? 'Choose automatically'
	);
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	oncancel={(e) => {
		e.preventDefault();
		open = false;
	}}
	class="m-0 mt-auto mr-auto mb-5 ml-5 w-[min(28rem,calc(100vw-2.5rem))] rounded-2xl border
		border-border bg-card p-5 text-card-foreground shadow-2xl shadow-black/40
		backdrop:bg-black/40"
>
	{#if open}
		<div transition:fly={{ y: 16, duration: 200 }} class="flex flex-col gap-5">
			<!-- Actions are icons, not labelled buttons. This is a panel you reach into mid-queue
				 and leave again; a row of full-width buttons reads as a form to fill in. Each one
				 keeps an aria-label and a title, so the meaning is still available to a screen
				 reader and on hover. -->
			<div class="flex items-center gap-3">
				<h2 class="text-base font-semibold tracking-tight">Quick controls</h2>
				<Button
					variant="ghost"
					size="icon"
					class="ml-auto size-tap shrink-0"
					onclick={() => (open = false)}
					aria-label="Close quick controls"
					title="Close"
				>
					<X class="size-6" />
				</Button>
			</div>

			<!-- Input. One or the other, as the web app's scanner treats them. -->
			<div>
				<p class="mb-2 text-sm font-medium text-muted-foreground">Input</p>
				<div class="grid grid-cols-2 gap-2">
					{#each [{ mode: 'usb' as const, icon: Usb, label: 'USB scanner' }, { mode: 'camera' as const, icon: Camera, label: 'Camera' }] as option (option.mode)}
						{@const selected = kiosk.inputMode === option.mode}
						<button
							type="button"
							onclick={() => kiosk.setInputMode(option.mode)}
							aria-pressed={selected}
							class="flex h-tap items-center justify-center gap-2 rounded-xl border text-base
								font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring
								focus-visible:outline-none
								{selected
								? 'border-transparent bg-primary text-primary-foreground'
								: 'border-border hover:bg-accent'}"
						>
							<option.icon class="size-5" aria-hidden="true" />
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			{#if kiosk.inputMode === 'camera'}
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium text-muted-foreground">Camera</p>
					{#if cameras.length > 1}
						<Select.Root
							type="single"
							value={kiosk.settings.cameraId ?? 'auto'}
							onValueChange={(v) =>
								kiosk.applyOperational({ cameraId: v === 'auto' ? null : v })}
						>
							<Select.Trigger class="h-tap w-full text-base" aria-label="Which camera">
								{cameraLabel}
							</Select.Trigger>
							<!--
								Portalled into the dialog, not to document.body.
							
								`showModal()` puts this dialog in the browser's top layer, which renders above
								everything in the normal document - including anything bits-ui appends to
								<body>. With the default target the camera list was drawn underneath the
								panel: in the DOM, but invisible and unclickable.
							-->
							<Select.Content portalProps={{ to: dialog ?? undefined }}>
								<Select.Item value="auto" label="Choose automatically">
									Choose automatically
								</Select.Item>
								{#each cameras as cam (cam.id)}
									<Select.Item value={cam.id} label={cam.label}>{cam.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					{/if}

					<!-- The same functions the web app's scanner exposes - switchCamera,
						 toggleFullscreen, isMirrored, toggleScanSize - as icons. -->
					<div class="grid grid-cols-4 gap-2">
						<Button
							variant="outline"
							size="icon"
							class="h-tap w-full"
							disabled={cameras.length < 2}
							onclick={switchCamera}
							aria-label="Switch camera"
							title="Switch camera"
						>
							<SwitchCamera class="size-5" />
						</Button>
						<Button
							variant={kiosk.settings.cameraFullscreen ? 'default' : 'outline'}
							size="icon"
							class="h-tap w-full"
							onclick={() =>
								kiosk.applyOperational({ cameraFullscreen: !kiosk.settings.cameraFullscreen })}
							aria-pressed={kiosk.settings.cameraFullscreen}
						aria-label={kiosk.settings.cameraFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
							title={kiosk.settings.cameraFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
						>
							{#if kiosk.settings.cameraFullscreen}
								<Minimize class="size-5" />
							{:else}
								<Maximize class="size-5" />
							{/if}
						</Button>
						<Button
							variant={kiosk.settings.cameraMirrored ? 'default' : 'outline'}
							size="icon"
							class="h-tap w-full"
							onclick={() =>
								kiosk.applyOperational({ cameraMirrored: !kiosk.settings.cameraMirrored })}
							aria-pressed={kiosk.settings.cameraMirrored}
						aria-label="Mirror the preview"
							title="Mirror"
						>
							<FlipHorizontal class="size-5" />
						</Button>
						<Button
							variant={kiosk.settings.cameraWideScan ? 'default' : 'outline'}
							size="icon"
							class="h-tap w-full"
							onclick={() =>
								kiosk.applyOperational({ cameraWideScan: !kiosk.settings.cameraWideScan })}
							aria-pressed={kiosk.settings.cameraWideScan}
						aria-label="Wide scan area"
							title="Wide scan area"
						>
							<ScanLine class="size-5" />
						</Button>
					</div>
				</div>
			{/if}

			<!-- Sound -->
			<div>
				<p class="mb-2 text-sm font-medium text-muted-foreground">Sound</p>
				<div class="flex items-center gap-3">
					<Button
						variant="outline"
						size="icon"
						class="size-tap shrink-0"
						onclick={toggleMute}
						aria-label={muted ? 'Unmute' : 'Mute'}
					>
						{#if muted}
							<VolumeX class="size-5" />
						{:else}
							<Volume2 class="size-5" />
						{/if}
					</Button>
					<Slider
						type="single"
						min={0}
						max={100}
						step={5}
						value={kiosk.settings.beepVolume}
						onValueChange={(v) => kiosk.applyOperational({ beepVolume: v as number })}
						onValueCommit={() => playAccepted()}
						class="flex-1"
						aria-label="Beep volume"
					/>
					<span class="w-10 text-right text-base text-muted-foreground tabular-nums">
						{kiosk.settings.beepVolume}
					</span>
					<Button
						variant="outline"
						size="icon"
						class="size-tap shrink-0"
						onclick={runTest}
						aria-label="Play the scan tone"
						title="Test sound"
					>
						{#if testing}
							<Check class="size-5 text-stat-success" />
						{:else}
							<Bell class="size-5" />
						{/if}
					</Button>
				</div>
			</div>

			<!-- Footer: the backlog, and the one action that costs a password. The test tone
				 moved up next to the volume it tests. -->
			<div class="flex items-center gap-2 border-t border-border pt-4">
				<Button
					variant="outline"
					size="icon"
					class="relative size-tap shrink-0"
					disabled={kiosk.queued === 0 || !kiosk.connected}
					onclick={() => kiosk.flushQueue()}
					aria-label={kiosk.queued > 0
						? `Sync ${kiosk.queued} waiting scans`
						: 'Everything is synced'}
					title={kiosk.queued > 0 ? `Sync ${kiosk.queued} waiting` : 'Synced'}
				>
					<RefreshCw class="size-5" />
					{#if kiosk.queued > 0}
						<!-- The count stays visible: it is the one number here that says something
							 is still outstanding. -->
						<span
							class="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full
								bg-amber-500 px-1 text-xs font-bold text-white tabular-nums"
						>
							{kiosk.queued}
						</span>
					{/if}
				</Button>

				<button
					type="button"
					onclick={() => {
						open = false;
						onsettings();
					}}
					class="ml-auto flex h-tap items-center gap-2 rounded-xl border border-border px-5
						text-base font-medium text-muted-foreground transition-colors hover:bg-accent
						focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<Lock class="size-4" aria-hidden="true" /> All settings
				</button>
			</div>
		</div>
	{/if}
</dialog>

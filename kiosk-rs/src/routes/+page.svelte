<script lang="ts">
	import { onMount } from 'svelte';
	import { kiosk } from '$lib/kiosk/state.svelte';
	import StatusStrip from '$lib/components/status-strip.svelte';
	import ScreenStandby from '$lib/components/screen-standby.svelte';
	import ScreenReady from '$lib/components/screen-ready.svelte';
	import ScreenSettings from '$lib/components/screen-settings.svelte';
	import ResultModal from '$lib/components/result-modal.svelte';
	import GearButton from '$lib/components/gear-button.svelte';
	import ElevationDialog from '$lib/components/elevation-dialog.svelte';
	import ScreenSignin from '$lib/components/screen-signin.svelte';
	import QuickPanel from '$lib/components/quick-panel.svelte';
	import ScreenPair from '$lib/components/screen-pair.svelte';
	import DevFab from '$lib/components/dev-fab.svelte';
	import { setupAudioUnlock, setBeepVolume } from '$lib/kiosk/beep';
	import { isHeld } from '$lib/kiosk/elevation';
	import { dev } from '$lib/kiosk/dev.svelte';
	import { fade, fly } from 'svelte/transition';
	import { dur } from '$lib/kiosk/motion';

	let elevationOpen = $state(false);
	let quickOpen = $state(false);

	/**
	 * First boot offers pairing, with account sign-in as the way back for a device that has not
	 * been paired yet - PLAN.md 8.8 keeps both alive until every kiosk is over.
	 */
	let firstRun = $state<'pair' | 'password'>('pair');

	/** Clock for the strip and the countdown. One timer, not one per component. */
	$effect(() => {
		const id = setInterval(() => {
			kiosk.now = new Date();
			// Piggy-backs on the clock rather than adding a timer: the runtime decides whether
			// the next event's start time is close enough to warrant an early refresh.
			kiosk.noteTick();
		}, 1000);
		return () => clearInterval(id);
	});

	/**
	 * A webview won't let audio play until it has seen a user gesture, and a scan callback
	 * isn't one. Arm the unlock as early as possible.
	 */
	$effect(() => {
		setupAudioUnlock();
	});

	/** Keep the tone generator in step with the Beep volume setting (0 mutes). */
	$effect(() => {
		setBeepVolume(kiosk.settings.beepVolume);
	});

	/**
	 * Load events, pick up any offline backlog, and start polling.
	 *
	 * `onMount`, NOT `$effect`. `start()` reads `kiosk.settings` (to merge the saved values
	 * over the defaults) and then writes it, which inside a tracked effect is a read-write
	 * cycle on the same `$state`: the effect re-runs itself until Svelte aborts with
	 * `effect_update_depth_exceeded`, and every later update on the page dies with it. That is
	 * what left the status strip showing "Organization Name" instead of the real one.
	 * This has to run exactly once, which is what onMount means.
	 */
	onMount(() => {
		void kiosk.start();
		return () => kiosk.stop();
	});

	/** Real connectivity, not a simulation - pull the network cable and the strip turns. */
	$effect(() => {
		kiosk.online = navigator.onLine;
		const on = () => {
			kiosk.online = true;
			// Coming back up is the moment the backlog should go out.
			void kiosk.flushQueue();
			void kiosk.refreshEvents();
		};
		const off = () => (kiosk.online = false);
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
		};
	});

	/**
	 * USB scanner input. A plug-and-play barcode scanner is a keyboard: it types the code
	 * fast and sends Enter. This is the real input path, not a stand-in - only the backend
	 * behind `kiosk.submit()` is still mocked.
	 */
	let buffer = '';
	let bufferTimer: ReturnType<typeof setTimeout> | null = null;

	function resetBuffer() {
		buffer = '';
		if (bufferTimer) clearTimeout(bufferTimer);
		bufferTimer = null;
	}

	function onKeydown(event: KeyboardEvent) {
		// Never swallow keystrokes meant for the password field or a settings input.
		const target = event.target as HTMLElement | null;
		if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
		if (kiosk.screen !== 'scan' || !kiosk.settings.usbScanner) return;

		if (event.key === 'Enter') {
			if (buffer) kiosk.submit(buffer);
			resetBuffer();
			return;
		}

		if (event.key.length === 1) {
			buffer += event.key;
			if (bufferTimer) clearTimeout(bufferTimer);
			// A half-finished burst is stale after a second - a human pressing keys should
			// never accumulate into a code.
			bufferTimer = setTimeout(resetBuffer, 1000);
		}
	}

	function openSettings() {
		// Re-entering Settings within the short hold skips the prompt; otherwise the password
		// gate applies. See $lib/kiosk/elevation.ts for why the hold is deliberately brief.
		if (isHeld()) {
			kiosk.openSettings();
			return;
		}
		elevationOpen = true;
	}

</script>

<svelte:window onkeydown={onKeydown} />

<main class="relative flex h-screen flex-col overflow-hidden bg-background">
	<StatusStrip />

	{#if !kiosk.authChecked}
		<!-- Restoring the stored session. Blank rather than a spinner: on a normal boot this
			 lasts a few hundred ms and a flashing spinner reads as a fault. -->
		<div class="flex-1"></div>
	{:else if kiosk.screen === 'settings'}
		<!--
			Above the session check on purpose. A kiosk is configured before it is paired -
			fullscreen, start-on-boot, the clock - and reaching that only by pairing first is
			backwards. ScreenSettings narrows itself to the device-level sections when there
			is no identity; see `signedOut` there.
		-->
		<ScreenSettings />
	{:else if !kiosk.identity}
		{#if firstRun === 'pair'}
			<ScreenPair
				ondone={() => kiosk.adoptSession()}
				onusepassword={() => (firstRun = 'password')}
				onsettings={() => kiosk.openSettings()}
			/>
		{:else}
			<ScreenSignin
				ondone={(identity) => kiosk.adoptSession(identity)}
				onusepairing={() => (firstRun = 'pair')}
				onsettings={() => kiosk.openSettings()}
			/>
		{/if}
	{:else}
		<!--
			A grid stack, not two flex siblings. During a transition Svelte keeps both screens
			mounted for a moment; as flex children they would sit one above the other and shove
			the layout around mid-fade. Every child here takes the same cell instead, and grid
			stretches them to fill it - which `position: absolute` would also do, at the cost of
			fighting the `flex-1` / `min-h-0` chain the camera feed depends on.
		-->
		<!-- `grid-rows-1` is load-bearing: without it the implicit row is `auto`, so the
			 screens size to their content instead of the viewport - the standby gradient
			 stops short and the camera feed's flex-1 chain has nothing to fill. -->
		<div
			class="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-1
				[&>*]:col-start-1 [&>*]:row-start-1"
		>
			{#if kiosk.scanning}
				<!--
					The asymmetry here is the whole choreography, and it needs no state machine.
					Standby gives way to scanning only when an event actually goes live, so the
					way *in* is the occasion: the old screen clears first, then this one rises.
					The way *out* - an event ending - is a plain fade, because it is not.

					Svelte does not run transitions on first render, so a kiosk that boots into a
					live event simply appears already scanning. Correct: nothing transitioned.
				-->
				<div
					class="flex min-h-0 flex-col"
					in:fly={{ y: 16, duration: dur(500), delay: dur(150) }}
					out:fade={{ duration: dur(250) }}
				>
					<ScreenReady />
				</div>
			{:else}
				<div
					class="flex min-h-0 flex-col"
					in:fade={{ duration: dur(350) }}
					out:fade={{ duration: dur(250) }}
				>
					<ScreenStandby />
				</div>
			{/if}
		</div>

		<GearButton onquick={() => (quickOpen = true)} onsettings={openSettings} />

		<!--
			Only on the live screens, and only with developer mode on. Settings has its own
			copy of these switches, and the previews cannot be seen from there anyway - which
			is the reason this exists.
		-->
		{#if dev.unlocked}
			<DevFab />
		{/if}

		{#if kiosk.result}
			<!-- Keyed so a scan arriving during a held result replays the arrival instead of
				 swapping text inside a static panel. -->
			{#key kiosk.result}
				<ResultModal result={kiosk.result} duration={kiosk.shared.resultDuration} />
			{/key}
		{/if}
	{/if}
</main>

<QuickPanel bind:open={quickOpen} onsettings={openSettings} />

<ElevationDialog bind:open={elevationOpen} ongranted={() => kiosk.openSettings()} />

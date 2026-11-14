<script lang="ts">
	import { onMount } from 'svelte';
	import { Bug, X } from '@lucide/svelte';
	import { kiosk } from '$lib/kiosk/state.svelte';
	import { dev } from '$lib/kiosk/dev.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { fly } from 'svelte/transition';
	import { dur } from '$lib/kiosk/motion';

	/**
	 * Floating developer options, draggable, in the manner of Expo's dev launcher.
	 *
	 * **Why this exists rather than just the Developer Tools section in Settings.** Every
	 * preview in there puts something on the *scan* screen — a result card, a change of event
	 * state — and Settings replaces that screen entirely. So the controls were in the one
	 * place from which their effects could not be seen: you pressed "Success", went back, and
	 * the card had already come and gone. The section stays (it is the right home for the
	 * switches), but anything that has to be *watched* belongs out here, over the live screen.
	 *
	 * **Why it moves.** It is drawn on top of the thing being inspected, so wherever it sits
	 * is eventually the wrong place — behind the result card's name, over the camera's framing
	 * box, on top of the countdown. Dragging is cheaper than guessing a corner that is always
	 * free, and the position is remembered per device.
	 *
	 * **Why actions count down.** Pressing a button puts your hand and this panel over the
	 * screen at the exact moment the thing you wanted to look at appears. Three seconds is
	 * enough to close the panel and step back to where a kiosk is actually read.
	 */
	const SIZE = 52;
	const MARGIN = 12;
	/** Below this, a press is a tap and not a drag. Generous: this is used with fingers. */
	const DRAG_SLOP = 6;

	let left = $state(0);
	let top = $state(0);
	let open = $state(false);
	let dragging = $state(false);

	let moved = false;
	let startX = 0;
	let startY = 0;
	let originLeft = 0;
	let originTop = 0;

	/** Free space the fraction is measured against, so the button can never land off-screen. */
	function bounds() {
		return {
			w: Math.max(0, window.innerWidth - SIZE - MARGIN * 2),
			h: Math.max(0, window.innerHeight - SIZE - MARGIN * 2)
		};
	}

	function place() {
		const { w, h } = bounds();
		left = MARGIN + dev.fab.x * w;
		top = MARGIN + dev.fab.y * h;
	}

	onMount(() => {
		place();
		// The kiosk is fullscreened onto whatever display it is plugged into, so the viewport
		// genuinely does change under it. Re-derive from the stored fraction rather than
		// clamping pixels, which would creep the button inward on every resize.
		window.addEventListener('resize', place);
		return () => window.removeEventListener('resize', place);
	});

	function onPointerDown(event: PointerEvent) {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragging = true;
		moved = false;
		startX = event.clientX;
		startY = event.clientY;
		originLeft = left;
		originTop = top;
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (!moved && Math.hypot(dx, dy) < DRAG_SLOP) return;

		moved = true;
		// Closed while moving: a panel that trails the button around is unreadable, and it
		// would be the thing under the finger rather than the button.
		open = false;
		const { w, h } = bounds();
		left = Math.min(MARGIN + w, Math.max(MARGIN, originLeft + dx));
		top = Math.min(MARGIN + h, Math.max(MARGIN, originTop + dy));
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;

		if (moved) {
			const { w, h } = bounds();
			dev.setFabPosition(w ? (left - MARGIN) / w : 0, h ? (top - MARGIN) / h : 0);
			return;
		}
		// A press that never moved is a tap. While something is armed it cancels instead,
		// which is the only way to call off a countdown you started by mistake.
		if (kiosk.armingSeconds > 0) kiosk.cancelArmedPreview();
		else open = !open;
	}

	/** Open away from the nearer edge, so the panel is never half off the screen. */
	const onLeftHalf = $derived(left + SIZE / 2 < (globalThis.innerWidth ?? 1280) / 2);
	const onTopHalf = $derived(top + SIZE / 2 < (globalThis.innerHeight ?? 800) / 2);

	function arm(run: () => void) {
		open = false;
		kiosk.armPreview(run);
	}

	const results = ['success', 'duplicate', 'rejected', 'queued'] as const;
</script>

<!--
	z-index above the result card (z-150). The card is the thing being previewed, so it must
	not be obscured — but losing the button underneath it, with no way to cancel or fire the
	next one until the card times out, is worse than a 52px circle in a corner.
-->
<div class="fixed z-[200]" style="left: {left}px; top: {top}px;">
	<button
		type="button"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={() => (dragging = false)}
		onkeydown={(e) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			if (kiosk.armingSeconds > 0) kiosk.cancelArmedPreview();
			else open = !open;
		}}
		style="width: {SIZE}px; height: {SIZE}px;"
		class="grid touch-none place-items-center rounded-full border-2 border-amber-500/70 bg-amber-500/15
			text-amber-600 shadow-lg backdrop-blur-sm transition-transform select-none
			focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
			dark:text-amber-400 {dragging ? 'scale-110 cursor-grabbing' : 'cursor-grab'}"
		aria-label={kiosk.armingSeconds > 0
			? `Preview in ${kiosk.armingSeconds} seconds. Activate to cancel.`
			: 'Developer options'}
		aria-expanded={open}
	>
		{#if kiosk.armingSeconds > 0}
			<span class="text-2xl font-black tabular-nums" aria-hidden="true">
				{kiosk.armingSeconds}
			</span>
		{:else}
			<Bug class="size-6" aria-hidden="true" />
		{/if}
	</button>

	{#if open}
		<!--
			Beside the button, not over the screen. A modal would defeat the point: the whole
			reason this is out here is to watch what the controls do to the screen behind it.
		-->
		<div
			class="absolute max-h-[70vh] w-[300px] max-w-[85vw] overflow-y-auto rounded-2xl border
				bg-card/95 p-4 shadow-2xl backdrop-blur-md
				{onLeftHalf ? 'left-[calc(100%+10px)]' : 'right-[calc(100%+10px)]'}
				{onTopHalf ? 'top-0' : 'bottom-0'}"
			transition:fly={{ x: onLeftHalf ? -8 : 8, duration: dur(150) }}
		>
			<div class="mb-3 flex items-center justify-between">
				<p class="text-sm font-bold tracking-wide uppercase">Developer</p>
				<button
					type="button"
					onclick={() => (open = false)}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground"
					aria-label="Close developer options"
				>
					<X class="size-4" />
				</button>
			</div>

			<div class="flex items-center justify-between gap-3 py-2">
				<div class="min-w-0">
					<p class="text-sm font-medium">Bypass event time</p>
					<p class="text-xs text-muted-foreground">Mocked results, nothing is written.</p>
				</div>
				<Switch
					checked={dev.bypass}
					onCheckedChange={(v) => kiosk.setBypass(v)}
					aria-label="Bypass event time validation"
				/>
			</div>

			<div class="flex items-center justify-between gap-3 border-t py-2">
				<div class="min-w-0">
					<p class="text-sm font-medium">Simulate offline</p>
					<p class="text-xs text-muted-foreground">Exercises the queue.</p>
				</div>
				<Switch
					checked={dev.forceOffline}
					onCheckedChange={(v) => kiosk.setForceOffline(v)}
					aria-label="Simulate offline"
				/>
			</div>

			<div class="border-t pt-3">
				<p class="mb-2 text-xs font-semibold text-muted-foreground">
					Previews — each starts after 3 seconds
				</p>

				<div class="grid grid-cols-2 gap-2">
					{#each results as kind (kind)}
						<Button
							variant="outline"
							size="sm"
							class="capitalize"
							onclick={() => arm(() => kiosk.previewResult(kind))}
						>
							{kind}
						</Button>
					{/each}
				</div>

				<Button
					variant="outline"
					size="sm"
					class="mt-2 w-full"
					disabled={kiosk.previewingEvents}
					onclick={() => arm(() => void kiosk.previewEventSequence())}
				>
					{kiosk.previewingEvents ? 'Running…' : 'Run the event sequence'}
				</Button>
				<p class="mt-1.5 text-xs leading-snug text-muted-foreground">
					Walks nothing scheduled → up next → starting now → scanning, about 15s. Real
					events are suspended and restored, and scans are refused while it runs.
				</p>
			</div>
		</div>
	{/if}
</div>

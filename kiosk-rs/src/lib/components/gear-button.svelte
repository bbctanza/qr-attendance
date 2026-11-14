<script lang="ts">
	import { Settings } from '@lucide/svelte';

	/**
	 * One control, two gestures.
	 *
	 * - **Short tap → quick panel.** The controls staff flip mid-event (input, sound, camera)
	 *   need no password: none of them can lose a scan or change who scans are recorded as.
	 * - **Long press 750 ms → full settings**, behind the password gate, for configuration.
	 *
	 * The long press is what keeps an unattended screen from being reconfigured by whoever is
	 * in the queue. It stays on the *administrative* half now rather than on everything, which
	 * is what made switching the scanner cost a password.
	 *
	 * Keyboard has no long-press equivalent, so Enter/Space opens the quick panel and the
	 * panel itself carries the route to full settings. Without that, a keyboard or
	 * screen-reader user could not reach settings at all.
	 */
	let { onquick, onsettings }: { onquick: () => void; onsettings: () => void } = $props();

	const HOLD_MS = 750;

	let holding = $state(false);
	/** Bumped per press so the progress ring restarts rather than resuming. */
	let presses = $state(0);
	let fired = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function start() {
		fired = false;
		presses += 1;
		holding = true;
		timer = setTimeout(() => {
			fired = true;
			holding = false;
			onsettings();
		}, HOLD_MS);
	}

	function end() {
		if (timer) clearTimeout(timer);
		timer = null;
		const wasHolding = holding;
		holding = false;
		// A release before the hold completed is a tap, not an abandoned long press.
		if (wasHolding && !fired) onquick();
	}

	function cancel() {
		if (timer) clearTimeout(timer);
		timer = null;
		holding = false;
	}
</script>

<button
	type="button"
	onpointerdown={start}
	onpointerup={end}
	onpointerleave={cancel}
	onpointercancel={cancel}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onquick();
		}
	}}
	class="group absolute right-5 bottom-5 grid size-14 place-items-center rounded-full
		text-muted-foreground/40 transition-colors hover:text-muted-foreground
		focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	aria-label="Kiosk controls. Tap for quick controls, hold for settings."
>
	<!-- A real circular progress sweep around the gear, not a fade: the ring tells you how much
		 of the 750 ms hold is left, so a long press is a thing you can watch complete rather than
		 guess at. Keyed on the press count so each hold restarts the animation from zero. -->
	{#if holding}
		{#key presses}
			<svg
				class="pointer-events-none absolute inset-0 size-full -rotate-90"
				viewBox="0 0 56 56"
				aria-hidden="true"
			>
				<circle
					cx="28"
					cy="28"
					r="25"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					class="text-border"
				/>
				<circle
					cx="28"
					cy="28"
					r="25"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					class="sweep text-primary"
				/>
			</svg>
		{/key}
	{/if}
	<Settings class="size-6 {holding ? 'text-primary' : ''} transition-colors" />
</button>

<style>
	/*
	 * 2 * PI * 25 = 157.08, the circumference of the r=25 ring. Sweeping the dash offset from
	 * the full circumference to zero draws the arc clockwise from 12 o'clock (the -rotate-90
	 * on the svg puts the start there).
	 */
	.sweep {
		stroke-dasharray: 157.08;
		stroke-dashoffset: 157.08;
		animation: sweep 750ms linear forwards;
	}

	@keyframes sweep {
		to {
			stroke-dashoffset: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		/* Still shows that a hold is in progress, without the animated sweep. */
		.sweep {
			animation: none;
			stroke-dashoffset: 118;
		}
	}
</style>

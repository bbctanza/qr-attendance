<script lang="ts">
	import { kiosk } from '$lib/kiosk/state.svelte';
	import { countdownTo, formatClock, formatDay, pad2 } from '$lib/kiosk/format';
	import { Calendar } from '@lucide/svelte';

	/**
	 * Standby, matching the web app's kiosk screen (its scan page, `{#if $kioskMode.enabled}`
	 * block). Same three states, same typographic scale and wording, so a person moving
	 * between the browser kiosk and this one sees the same product.
	 *
	 * The top identity bar from the web app's version is deliberately NOT reproduced here -
	 * this app has a persistent status strip above every screen that already carries the
	 * organisation, connection and clock.
	 */
	const target = $derived(kiosk.nextEvent ? new Date(kiosk.nextEvent.start_datetime) : null);
	const countdown = $derived(target ? countdownTo(target, kiosk.now) : null);

	/**
	 * nextEvent exists but its start time has passed. Rendered as its own "Starting now"
	 * state rather than 00:00:00, which would sit there reading as a frozen kiosk if the
	 * event's status hasn't flipped to ongoing yet.
	 */
	const overdue = $derived(kiosk.nextEvent !== null && countdown === null);

	const units = $derived(
		countdown
			? [
					{ value: countdown.hours, label: 'Hours' },
					{ value: countdown.minutes, label: 'Minutes' },
					{ value: countdown.seconds, label: 'Seconds' }
				]
			: []
	);
</script>

<!-- Gradient ground, as the web app's kiosk standby. Burn-in guard kept from this app's own
	 version: an unattended screen holds this layout for hours, so the block drifts a few
	 pixels over a four-minute cycle - too slow to read as motion. -->
<section
	class="flex flex-1 flex-col items-center justify-center overflow-hidden
		bg-gradient-to-b from-background to-muted px-8 text-center"
>
	<div class="drift">
		{#if kiosk.nextEvent && countdown}
			<div class="max-w-[820px]">
				<div class="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
					Up next
				</div>
				<div class="mt-2.5 text-5xl font-extrabold tracking-tight text-foreground">
					{kiosk.nextEvent.event_name}
				</div>
				<div class="mt-2 text-lg text-muted-foreground">
					{formatClock(target!, kiosk.settings.timeFormat)}
				</div>

				<div class="mt-12 flex items-center justify-center gap-4">
					{#each units as unit, i (unit.label)}
						{#if i > 0}
							<div class="-mt-4 text-4xl font-light text-border" aria-hidden="true">:</div>
						{/if}
						<div class="min-w-[108px]">
							<div class="text-6xl font-black text-primary tabular-nums">
								{pad2(unit.value)}
							</div>
							<div
								class="mt-1.5 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase"
							>
								{unit.label}
							</div>
						</div>
					{/each}
				</div>

				<div class="mt-9 text-sm text-muted-foreground">
					Scanning opens automatically the moment the event goes live — nothing to tap.
				</div>
			</div>
		{:else if overdue}
			<div class="max-w-[620px]">
				<div class="flex items-center justify-center gap-2.5">
					<span class="h-2.5 w-2.5 animate-pulse rounded-full bg-primary"></span>
					<span class="text-xs font-bold tracking-[0.14em] text-primary uppercase">
						Starting now
					</span>
				</div>
				<div class="mt-3 text-5xl font-extrabold tracking-tight text-foreground">
					{kiosk.nextEvent?.event_name}
				</div>
				<div class="mt-3 text-sm text-muted-foreground">
					Waiting on the scanner to pick it up — this takes a moment, not a tap.
				</div>
			</div>
		{:else}
			<!-- Genuinely different copy, not the countdown with zeroes in it: 00:00:00 reads
				 as broken rather than as "nothing is scheduled". -->
			<div class="max-w-[620px]">
				<!-- With no event there is no countdown to show, which left this screen with a
					 paragraph and nothing else. The wall clock takes that space instead: it is the
					 one thing an idle kiosk can usefully say, and a second-ticking clock is also
					 the clearest proof the device hasn't frozen. The header clock is deliberately
					 small, so it does not do this job from across a room. -->
				<div class="text-7xl font-black tracking-tight tabular-nums sm:text-8xl">
					{formatClock(kiosk.now, kiosk.settings.timeFormat, true)}
				</div>
				<div class="mt-2 text-lg text-muted-foreground">{formatDay(kiosk.now)}</div>

				<div
					class="mx-auto mt-12 flex h-[72px] w-[72px] items-center justify-center rounded-[20px]
						border bg-card shadow-xs"
				>
					<Calendar class="h-8 w-8 text-muted-foreground" />
				</div>
				<div class="mt-6 text-[32px] font-extrabold">Nothing scheduled right now</div>
				<div class="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
					The kiosk keeps watching — as soon as an event is scheduled and its start time
					arrives, this screen updates on its own.
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.drift {
		animation: drift 240s ease-in-out infinite;
	}

	@keyframes drift {
		0%,
		100% {
			transform: translate(0, 0);
		}
		25% {
			transform: translate(6px, -8px);
		}
		50% {
			transform: translate(-4px, 7px);
		}
		75% {
			transform: translate(-7px, -5px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.drift {
			animation: none;
		}
	}
</style>

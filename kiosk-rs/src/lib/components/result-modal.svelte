<script lang="ts">
	import { CheckCircle2, AlertCircle, XCircle, CloudOff } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import { kiosk } from '$lib/kiosk/state.svelte';
	import { formatClock } from '$lib/kiosk/format';
	import type { ScanResult } from '$lib/kiosk/types';

	/**
	 * Scan result, ported from the web app's `scan-status-modal.svelte`: same centred card over
	 * a dimmed backdrop, same circular icon chip, same label rows, same countdown to dismiss.
	 *
	 * This replaces the full-bleed colour flood this app previously used. That was chosen for
	 * readability at 1-2 m (PLAN.md section 5.4); the card is what the main system does, and
	 * matching it was the explicit call. The colour cues are kept strong - icon, heading colour
	 * and a tinted chip - so the outcome is still legible at a glance rather than by reading.
	 *
	 * The queued state is this app's own: the web app has no offline queue and so has nothing
	 * to say here.
	 */
	let { result, duration }: { result: ScanResult; duration: number } = $props();

	const isSuccess = $derived(result.outcome === 'success');
	const isDuplicate = $derived(result.outcome === 'duplicate');

	const heading = $derived(
		result.queued
			? 'Saved — will sync'
			: isSuccess
				? 'Successfully Checked In!'
				: isDuplicate
					? 'Already Checked In'
					: 'Check-in Failed'
	);

	const subheading = $derived(
		result.queued
			? 'No connection right now. This check-in is stored on the device and will upload itself.'
			: isSuccess
				? 'Attendance has been recorded in the database'
				: isDuplicate
					? 'This member has already been checked in for this event'
					: (result.reason ?? 'Something went wrong. Please try again.')
	);

	/**
	 * Amber for queued and duplicate, green for a confirmed save, red for a refusal.
	 *
	 * These are Tailwind's green/amber/red, the same scale `scan-status-modal.svelte` uses -
	 * NOT this app's `--kiosk-*` tokens. Those were mixed for the old full-bleed flood, where
	 * they had to carry large white type on top; on a card against `bg-card` they read as
	 * muddy next to the main system's.
	 */
	const tone = $derived(
		result.queued || isDuplicate ? 'amber' : isSuccess ? 'success' : 'destructive'
	);
</script>

<div
	class="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-6"
	in:fade={{ duration: 150 }}
	role="status"
	aria-live="assertive"
>
	<div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>

	<div
		class="relative z-10 w-full max-w-sm rounded-3xl border border-border/40 bg-card shadow-2xl
			md:max-w-md"
	>
		<div class="space-y-6 p-6 sm:p-8">
			<div class="flex justify-center">
				<div
					class="rounded-full p-4 {tone === 'success'
						? 'bg-green-500/10'
						: tone === 'amber'
							? 'bg-amber-500/10'
							: 'bg-red-500/10'}"
				>
					{#if result.queued}
						<CloudOff class="h-14 w-14 text-amber-500" />
					{:else if isSuccess}
						<CheckCircle2 class="h-14 w-14 text-green-500" />
					{:else if isDuplicate}
						<AlertCircle class="h-14 w-14 text-amber-500" />
					{:else}
						<XCircle class="h-14 w-14 text-red-500" />
					{/if}
				</div>
			</div>

			<div class="space-y-1 text-center">
				<h2
					class="text-2xl font-bold md:text-3xl {tone === 'success'
						? 'text-green-600'
						: tone === 'amber'
							? 'text-amber-600'
							: 'text-red-600'}"
				>
					{heading}
				</h2>
				<p class="text-sm text-muted-foreground">{subheading}</p>
			</div>

			{#if result.member_name || result.member_code}
				<div class="space-y-3 rounded-2xl bg-muted/40 p-4">
					{#if result.member_name}
						<div class="flex items-center justify-between gap-4">
							<span class="text-sm font-medium text-muted-foreground">Name:</span>
							<span class="text-right font-semibold">{result.member_name}</span>
						</div>
					{/if}
					{#if result.member_code}
						<div class="h-px bg-border/40"></div>
						<div class="flex items-center justify-between gap-4">
							<span class="text-sm font-medium text-muted-foreground">Member ID:</span>
							<span class="text-right font-mono text-sm font-semibold">{result.member_code}</span>
						</div>
					{/if}
					{#if result.care_group}
						<div class="h-px bg-border/40"></div>
						<div class="flex items-center justify-between gap-4">
							<span class="text-sm font-medium text-muted-foreground">Care Group:</span>
							<span class="text-right font-semibold">{result.care_group}</span>
						</div>
					{/if}
					<div class="h-px bg-border/40"></div>
					<div class="flex items-center justify-between gap-4">
						<span class="text-sm font-medium text-muted-foreground">
							{isDuplicate ? 'Checked in at:' : 'Time:'}
						</span>
						<span class="text-right font-mono font-semibold">
							{formatClock(result.at, kiosk.settings.timeFormat)}
						</span>
					</div>
				</div>
			{/if}

			{#if isDuplicate}
				<div
					class="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm
						text-amber-600"
				>
					<p>If you need to update their attendance record, please contact an administrator.</p>
				</div>
			{/if}

			<!-- Auto-dismiss countdown. Nobody taps this - it exists so the person in front of the
				 screen can see the device is counting down rather than frozen. -->
			<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="timer h-full rounded-full {tone === 'success'
						? 'bg-green-500'
						: tone === 'amber'
							? 'bg-amber-500'
							: 'bg-red-500'}"
					style="animation-duration: {duration}s"
				></div>
			</div>
		</div>
	</div>
</div>

<style>
	.timer {
		width: 100%;
		animation-name: drain;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}

	@keyframes drain {
		from {
			width: 100%;
		}
		to {
			width: 0%;
		}
	}
</style>

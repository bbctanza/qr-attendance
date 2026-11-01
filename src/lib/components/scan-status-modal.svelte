<script lang="ts">
	import {
		CheckCircle2,
		AlertCircle,
		XCircle,
		Loader2,
		Users,
		AlertTriangle
	} from '@lucide/svelte';
	import TimedButton from '$lib/components/timed-button.svelte';
	import { fade } from 'svelte/transition';
	import type { ScanQueueState, ScanRejection } from '$lib/utils/scanQueue';

	/**
	 * One overlay for the whole scan lifecycle.
	 *
	 * The point of a single always-mounted overlay is that processing flows straight into the
	 * result without the station ever looking idle. Separate mount/unmount modals are exactly
	 * what left a gap between "scanned" and "confirmed", which is the window people used to
	 * re-scan into.
	 *
	 * The processing phase renders regardless of the scan-modal setting - it is the cue that
	 * stops the next person scanning too early, so it is not something to switch off by accident.
	 * `showResultDetail` only governs the success/duplicate/error detail cards.
	 */
	let {
		state,
		rejection = null,
		showResultDetail = true,
		resultDuration = 5000,
		onDismiss
	}: {
		state: ScanQueueState;
		rejection?: ScanRejection | null;
		showResultDetail?: boolean;
		resultDuration?: number;
		onDismiss: () => void;
	} = $props();

	let outcome = $derived(state.outcome);

	let isResultPhase = $derived(
		state.phase === 'success' || state.phase === 'duplicate' || state.phase === 'error'
	);

	/**
	 * A turned-away scan has to appear here, not in a toast.
	 *
	 * A toast is small, in a corner, and easily missed over the scanner's own beep - which is the
	 * exact confusion this overlay exists to remove. If the app can't say "that didn't count"
	 * as loudly as it says "checked in", someone walks away believing a rejected scan worked.
	 */
	let isOpen = $derived(
		state.phase === 'processing' || (isResultPhase && showResultDetail) || !!rejection
	);

	// A rejection arriving while the queue is idle has no result card to attach to, so it
	// becomes the whole card instead of a banner on top of one.
	let rejectionOnly = $derived(!!rejection && state.phase === 'idle');

	let rejectionText = $derived.by(() => {
		if (!rejection) return null;
		if (rejection.kind === 'full') {
			return {
				title: 'Too many scans at once',
				detail: 'That scan was not recorded. Please wait, then scan again.'
			};
		}
		// Same code, inside the dedupe window: either we're mid-flight on it, or it just finished.
		return state.phase === 'processing'
			? {
					title: 'Already scanning you',
					detail: 'Hold on — your check-in is still being saved.'
				}
			: {
					title: 'Already scanned',
					detail: 'You have just been checked in. No need to scan again.'
				};
	});
</script>

{#if isOpen}
	<div
		class="pointer-events-auto fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-6"
		in:fade={{ duration: 150 }}
		role="status"
		aria-live="assertive"
	>
		<!-- Backdrop. Not click-to-dismiss while processing: the scan is genuinely in flight and
		     closing early would only re-create the ambiguity this overlay exists to remove. -->
		{#if state.phase === 'processing'}
			<div class="absolute inset-0 bg-black/85 backdrop-blur-sm"></div>
		{:else}
			<div
				class="pointer-events-auto absolute inset-0 bg-black/80 backdrop-blur-sm"
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Escape' && onDismiss()}
				aria-label="Dismiss"
				onclick={onDismiss}
			></div>
		{/if}

		<div
			class="pointer-events-auto relative z-10 w-full max-w-sm rounded-3xl border border-border/40 bg-card shadow-2xl md:max-w-md"
		>
			<!-- Queue depth: lets the operator see a backlog building rather than guessing. -->
			{#if state.queueDepth > 0}
				<div
					class="flex items-center justify-center gap-2 rounded-t-3xl border-b border-border/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
				>
					<Users class="h-4 w-4" />
					{state.queueDepth}
					{state.queueDepth === 1 ? 'person' : 'people'} waiting
				</div>
			{/if}

			<!-- A turned-away scan reads first, above whatever phase is underneath it. Amber/red
			     and full width so it cannot be mistaken for the green "checked in" state. -->
			{#if rejectionText}
				<div
					class="flex items-start gap-3 border-b px-5 py-4 {state.queueDepth > 0
						? ''
						: 'rounded-t-3xl'} {rejection?.kind === 'full'
						? 'border-red-500/30 bg-red-500/10 text-red-600'
						: 'border-amber-500/30 bg-amber-500/10 text-amber-600'}"
				>
					<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0" />
					<div class="text-left">
						<p class="text-sm font-bold">{rejectionText.title}</p>
						<p class="text-xs opacity-90">{rejectionText.detail}</p>
					</div>
				</div>
			{/if}

			<div class="space-y-6 p-6 sm:p-8">
				{#if rejectionOnly}
					<!-- Nothing is in flight, so the notice is the whole card. -->
					<div class="flex justify-center">
						<div class="rounded-full bg-amber-500/10 p-4">
							<AlertTriangle class="h-14 w-14 text-amber-500" />
						</div>
					</div>
					<div class="space-y-1 text-center">
						<h2 class="text-2xl font-bold text-amber-600 md:text-3xl">Not scanned again</h2>
						<p class="text-sm text-muted-foreground">{rejectionText?.detail}</p>
					</div>
				{:else if state.phase === 'processing'}
					<div class="flex justify-center">
						<div class="rounded-full bg-primary/10 p-4">
							<Loader2 class="h-14 w-14 animate-spin text-primary" />
						</div>
					</div>

					<div class="space-y-1 text-center">
						<h2 class="text-2xl font-bold md:text-3xl">Checking in…</h2>
						<p class="text-sm text-muted-foreground">Saving attendance to the database</p>
					</div>

					{#if state.currentCode}
						<div class="rounded-2xl bg-muted/40 p-4 text-center">
							<p class="text-xs font-medium text-muted-foreground">Scanned code</p>
							<p class="mt-1 font-mono text-lg font-semibold break-all">{state.currentCode}</p>
						</div>
					{/if}

					<!-- The instruction that does the real work at a busy desk. -->
					<div
						class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center text-sm font-medium text-amber-600"
					>
						Please wait for the confirmation.<br />
						<span class="font-semibold">Next person — hold your code back.</span>
					</div>
				{:else if outcome}
					{@const isSuccess = state.phase === 'success'}
					{@const isDuplicate = state.phase === 'duplicate'}

					<div class="flex justify-center">
						<div
							class="rounded-full p-4 {isSuccess
								? 'bg-green-500/10'
								: isDuplicate
									? 'bg-amber-500/10'
									: 'bg-red-500/10'}"
						>
							{#if isSuccess}
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
							class="text-2xl font-bold md:text-3xl {isSuccess
								? 'text-green-600'
								: isDuplicate
									? 'text-amber-600'
									: 'text-red-600'}"
						>
							{isSuccess
								? 'Successfully Checked In!'
								: isDuplicate
									? 'Already Checked In'
									: 'Check-in Failed'}
						</h2>
						<p class="text-sm text-muted-foreground">
							{#if isSuccess}
								Attendance has been recorded in the database
							{:else if isDuplicate}
								This member has already been checked in for this event
							{:else}
								{outcome.message || 'Something went wrong. Please try again.'}
							{/if}
						</p>
					</div>

					{#if outcome.memberName || outcome.memberId}
						<div class="space-y-3 rounded-2xl bg-muted/40 p-4">
							{#if outcome.memberName}
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-muted-foreground">Name:</span>
									<span class="text-right font-semibold">{outcome.memberName}</span>
								</div>
							{/if}
							{#if outcome.memberId}
								<div class="h-px bg-border/40"></div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-muted-foreground">Member ID:</span>
									<span class="text-right font-mono text-sm font-semibold">{outcome.memberId}</span>
								</div>
							{/if}
							{#if isSuccess && outcome.careGroup}
								<div class="h-px bg-border/40"></div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-muted-foreground">Care Group:</span>
									<span class="text-right font-semibold">{outcome.careGroup}</span>
								</div>
							{/if}
							{#if isSuccess && outcome.time}
								<div class="h-px bg-border/40"></div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-muted-foreground">Time:</span>
									<span class="text-right font-mono font-semibold">{outcome.time}</span>
								</div>
							{/if}
						</div>
					{/if}

					{#if isDuplicate}
						<div
							class="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600"
						>
							<p>If you need to update their attendance record, please contact an administrator.</p>
						</div>
					{/if}

					<!-- Keyed on the code so each result gets a fresh countdown rather than inheriting
					     an already-expired one from the previous scan. -->
					{#key outcome.memberId ?? state.currentCode}
						<TimedButton
							label={state.queueDepth > 0 ? 'Next person…' : 'Continue Scanning'}
							variant={isSuccess ? 'success' : 'error'}
							duration={resultDuration}
							onClick={onDismiss}
							onExpire={onDismiss}
						/>
					{/key}
				{/if}
			</div>
		</div>
	</div>
{/if}

<script lang="ts">
	import { CheckCircle2, X } from '@lucide/svelte';
	import TimedButton from '$lib/components/timed-button.svelte';
	import { onMount } from 'svelte';

	interface Props {
		isOpen: boolean;
		memberName: string;
		memberId: string;
		careGroup: string;
		time: string;
		onClose: () => void;
		autoCloseDuration?: number;
	}

	let {
		isOpen = $bindable(),
		memberName,
		memberId,
		careGroup,
		time,
		onClose,
		autoCloseDuration = 5000
	} = $props();

	function handleClose() {
		isOpen = false;
		onClose();
	}

	function handleContinue() {
		handleClose();
	}
</script>

{#if isOpen}
	<div class="pointer-events-auto fixed inset-0 z-150 flex items-center justify-center p-4">
		<!-- Backdrop -->
		<div
			class="pointer-events-auto absolute inset-0 bg-black/40 backdrop-blur-sm"
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && handleClose()}
			aria-label="Close modal"
			onclick={handleClose}
		></div>

		<!-- Modal -->
		<div
			class="pointer-events-auto relative z-10 w-full max-w-sm animate-in rounded-3xl border border-border/40 bg-card shadow-2xl duration-300 fade-in zoom-in"
		>
			<!-- Modal Content -->
			<div class="relative space-y-6 p-6 sm:p-8">
				<!-- Close Button -->
				<button
					onclick={handleClose}
					class="absolute top-4 right-4 rounded-lg p-2 transition-colors hover:bg-muted"
					aria-label="Close"
				>
					<X class="h-5 w-5 text-muted-foreground" />
				</button>

				<!-- Success Icon -->
				<div class="flex justify-center">
					<div class="rounded-full bg-green-500/10 p-4">
						<CheckCircle2 class="h-12 w-12 text-green-500" />
					</div>
				</div>

				<!-- Success Message -->
				<div class="space-y-1 text-center">
					<h2 class="text-2xl font-bold text-green-600">✓ Successfully Checked In!</h2>
					<p class="text-sm text-muted-foreground">Attendance has been recorded in the database</p>
				</div>

				<!-- Member Details -->
				<div class="space-y-3 rounded-2xl bg-muted/40 p-4">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-muted-foreground">Name:</span>
						<span class="text-right font-semibold">{memberName}</span>
					</div>
					<div class="h-px bg-border/40"></div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-muted-foreground">Member ID:</span>
						<span class="text-right font-mono text-sm font-semibold">{memberId}</span>
					</div>
					<div class="h-px bg-border/40"></div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-muted-foreground">Care Group:</span>
						<span class="text-right font-semibold">{careGroup}</span>
					</div>
					<div class="h-px bg-border/40"></div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-muted-foreground">Time:</span>
						<span class="text-right font-mono font-semibold">{time}</span>
					</div>
				</div>

				<!-- Timed Button -->
				<TimedButton
					label="Continue Scanning"
					variant="success"
					duration={autoCloseDuration}
					onClick={handleContinue}
					onExpire={handleClose}
				/>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes zoomIn {
		from {
			transform: scale(0.95);
		}
		to {
			transform: scale(1);
		}
	}

	:global(.animate-in) {
		animation:
			fadeIn 0.3s ease-out,
			zoomIn 0.3s ease-out;
	}
</style>

<script lang="ts">
	import { AlertCircle, X } from '@lucide/svelte';
	import TimedButton from '$lib/components/timed-button.svelte';

	interface Props {
		isOpen: boolean;
		memberName: string;
		memberId: string;
		onClose: () => void;
		autoCloseDuration?: number;
	}

	let { isOpen = $bindable(), memberName, memberId, onClose, autoCloseDuration = 5000 } = $props();

	function handleClose() {
		isOpen = false;
		onClose();
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

				<!-- Error Icon -->
				<div class="flex justify-center">
					<div class="rounded-full bg-red-500/10 p-4">
						<AlertCircle class="h-12 w-12 text-red-500" />
					</div>
				</div>

				<!-- Error Message -->
				<div class="space-y-1 text-center">
					<h2 class="text-2xl font-bold text-red-600">Already Checked In</h2>
					<p class="text-sm text-muted-foreground">
						This member has already been checked in for this event
					</p>
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
				</div>

				<!-- Info Text -->
				<div
					class="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600"
				>
					<p>If you need to update their attendance record, please contact an administrator.</p>
				</div>

				<!-- Timed Button -->
				<TimedButton
					label="Dismiss"
					variant="error"
					duration={autoCloseDuration}
					onClick={handleClose}
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

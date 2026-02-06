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
	<div class="fixed inset-0 z-150 flex items-center justify-center p-4 pointer-events-auto">
		<!-- Backdrop -->
		<div
			class="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
			role="button"
			tabindex="0"
			onkeydown={(e) => (e.key === 'Escape') && handleClose()}
			aria-label="Close modal"
			onclick={handleClose}
		></div>

		<!-- Modal -->
		<div class="relative z-10 w-full max-w-sm rounded-3xl bg-card border border-border/40 shadow-2xl animate-in fade-in zoom-in duration-300 pointer-events-auto">
			<!-- Modal Content -->
			<div class="p-6 sm:p-8 space-y-6 relative">
				<!-- Close Button -->
				<button
					onclick={handleClose}
					class="absolute top-4 right-4 p-2 hover:bg-muted rounded-lg transition-colors"
					aria-label="Close"
				>
					<X class="h-5 w-5 text-muted-foreground" />
				</button>

				<!-- Error Icon -->
				<div class="flex justify-center">
					<div class="p-4 bg-red-500/10 rounded-full">
						<AlertCircle class="h-12 w-12 text-red-500" />
					</div>
				</div>

				<!-- Error Message -->
				<div class="text-center space-y-1">
					<h2 class="text-2xl font-bold text-red-600">Already Checked In</h2>
					<p class="text-sm text-muted-foreground">This member has already been checked in for this event</p>
				</div>

				<!-- Member Details -->
				<div class="bg-muted/40 rounded-2xl p-4 space-y-3">
					<div class="flex justify-between items-center">
						<span class="text-sm text-muted-foreground font-medium">Name:</span>
						<span class="font-semibold text-right">{memberName}</span>
					</div>
					<div class="h-px bg-border/40"></div>
					<div class="flex justify-between items-center">
						<span class="text-sm text-muted-foreground font-medium">Member ID:</span>
						<span class="font-mono text-sm font-semibold text-right">{memberId}</span>
					</div>
				</div>

				<!-- Info Text -->
				<div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-600">
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
		animation: fadeIn 0.3s ease-out, zoomIn 0.3s ease-out;
	}
</style>

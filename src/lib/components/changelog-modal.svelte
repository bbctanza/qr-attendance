<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { X, ChevronDown } from 'lucide-svelte';
	import { systemSettings } from '$lib/stores/settings';
	import { changelog } from '$lib/config/changelog';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();
	let currentIndex = $state(0);
	let showScrollHint = $state(false);
	let scrollContainer: HTMLDivElement | undefined;

	const currentEntry = $derived(changelog[currentIndex]);
	const isFirst = $derived(currentIndex === 0);
	const isLast = $derived(currentIndex === changelog.length - 1);

	function handleNext() {
		if (!isLast) {
			currentIndex++;
			// Reset scroll position and check scroll hint
			if (scrollContainer) {
				scrollContainer.scrollTop = 0;
				checkScrollHint();
			}
		}
	}

	function handlePrevious() {
		if (!isFirst) {
			currentIndex--;
			// Reset scroll position and check scroll hint
			if (scrollContainer) {
				scrollContainer.scrollTop = 0;
				checkScrollHint();
			}
		}
	}

	function handleClose() {
		open = false;
	}

	function handleDontShowAgain() {
		if (currentEntry) {
			if (typeof window !== 'undefined') {
				localStorage.setItem('lastSeenVersion', currentEntry.version);
			}
		}
		open = false;
	}

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;

		const isNearBottom = scrollHeight - scrollTop - clientHeight < 20;
		const hasSignificantOverflow = scrollHeight > clientHeight + 10;

		// Hide hint if we scrolled down or reached bottom
		if (scrollTop > 10 || isNearBottom) {
			showScrollHint = false;
		} else if (hasSignificantOverflow) {
			showScrollHint = true;
		}
	}

	function checkScrollHint() {
		if (!scrollContainer) return;
		const { scrollHeight, clientHeight } = scrollContainer;
		const hasSignificantOverflow = scrollHeight > clientHeight + 10;
		const isAtTop = scrollContainer.scrollTop < 10;
		showScrollHint = hasSignificantOverflow && isAtTop;
	}

	function onOpenChange(isOpen: boolean) {
		if (isOpen) {
			currentIndex = 0;
			// Multiple checks as layout stabilizes
			setTimeout(checkScrollHint, 100);
			setTimeout(checkScrollHint, 400);
		}
	}

	// Watch for entry changes and open state
	$effect(() => {
		if (open && scrollContainer) {
			setTimeout(checkScrollHint, 50);
			setTimeout(checkScrollHint, 200);
		}
	});

	$effect(() => {
		if (currentEntry && scrollContainer) {
			scrollContainer.scrollTop = 0;
			setTimeout(checkScrollHint, 100);
		}
	});
</script>

<AlertDialog bind:open {onOpenChange}>
	<AlertDialogContent
		class="pointer-events-auto grid h-auto max-h-[90vh] w-[95vw] max-w-2xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl border-none p-0 shadow-2xl sm:max-h-[85vh] sm:rounded-lg"
	>
		<!-- Fixed Header (Row 1) -->
		<div class="z-30 border-b bg-background px-5 pt-5 pb-4 sm:px-6">
			<div class="flex flex-row items-start justify-between gap-4">
				<div class="min-w-0 flex-1 text-left">
					<AlertDialogTitle class="text-lg font-bold tracking-tight wrap-break-word sm:text-2xl">
						{currentEntry.title}
					</AlertDialogTitle>
					<AlertDialogDescription class="mt-1 text-xs font-medium opacity-70 sm:text-sm">
						Version {currentEntry.version} • {currentEntry.date}
					</AlertDialogDescription>
				</div>
				<button
					onclick={handleClose}
					class="-mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
					aria-label="Close"
				>
					<X class="h-5 w-5 sm:h-6 sm:w-6" />
				</button>
			</div>
		</div>

		<!-- Scrollable Content (Row 2) -->
		<div class="relative min-h-37.5 overflow-hidden bg-background">
			<div
				bind:this={scrollContainer}
				onscroll={handleScroll}
				class="scroll-container h-full w-full overflow-x-hidden overflow-y-auto overscroll-contain"
				style="scrollbar-gutter: stable;"
			>
				<div class="px-5 py-4 pb-20 sm:px-8 sm:py-6">
					<div class="space-y-3 sm:space-y-4">
						{#each currentEntry.items as item}
							<div class="group flex items-start gap-3 sm:gap-4">
								<div
									class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary ring-2 ring-primary/10 transition-transform group-hover:scale-110 sm:h-2 sm:w-2"
								></div>
								<p class="text-xs leading-relaxed font-medium text-foreground/90 sm:text-base">
									{item}
								</p>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Scroll Hint Indicator - Overlay -->
			{#if showScrollHint}
				<div
					class="pointer-events-none absolute right-0 bottom-0 left-0 z-20 flex h-24 flex-col items-center justify-end bg-linear-to-t from-background via-background/95 to-transparent pb-4 transition-opacity duration-500"
				>
					<div class="flex animate-bounce flex-col items-center gap-1.5">
						<span
							class="text-[9px] font-black tracking-[0.2em] uppercase sm:text-[10px]"
							style="color: {$systemSettings.primaryColor}">Scroll for more</span
						>
						<ChevronDown
							class="h-4 w-4 sm:h-5 sm:w-5"
							style="color: {$systemSettings.primaryColor}"
						/>
					</div>
				</div>
			{/if}
		</div>

		<!-- Fixed Footer (Row 3) -->
		<div class="z-30 border-t bg-background px-5 py-4 sm:px-6">
			<div
				class="flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-3"
			>
				<div class="flex gap-2">
					<Button
						variant="outline"
						onclick={handlePrevious}
						disabled={isFirst}
						class="flex-1 text-xs sm:flex-none sm:text-sm"
					>
						Previous
					</Button>
					<Button
						variant="outline"
						onclick={handleNext}
						disabled={isLast}
						class="flex-1 gap-2 text-xs sm:flex-none sm:text-sm"
					>
						Next
						<ChevronDown class="h-4 w-4 rotate-90" />
					</Button>
				</div>
				<div class="flex gap-2">
					<Button
						variant="outline"
						onclick={handleDontShowAgain}
						class="flex-1 text-xs sm:flex-none sm:text-sm"
					>
						Don't Show Again
					</Button>
					<Button onclick={handleClose} class="flex-1 text-xs sm:flex-none sm:text-sm">
						Continue
					</Button>
				</div>
			</div>
		</div>
	</AlertDialogContent>
</AlertDialog>

<style>
	:global([data-state='open']) {
		animation: dialogShow 0.2s ease-out;
	}

	@keyframes dialogShow {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Scrollbar styling for the scroll container */
	:global(.scroll-container::-webkit-scrollbar) {
		width: 10px;
	}

	:global(.scroll-container::-webkit-scrollbar-thumb) {
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 10px;
		border: 2px solid transparent;
		background-clip: content-box;
	}

	:global(.scroll-container::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(.dark .scroll-container::-webkit-scrollbar-thumb) {
		background-color: rgba(255, 255, 255, 0.25);
	}

	:global(.scroll-container) {
		scrollbar-width: thin;
		scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
	}

	:global(.dark .scroll-container) {
		scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
	}

	:global(.animate-bounce) {
		animation: bounce 2s infinite;
	}

	@keyframes bounce {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(8px);
		}
	}
</style>

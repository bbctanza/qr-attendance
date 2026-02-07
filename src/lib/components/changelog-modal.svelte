<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogHeader,
		AlertDialogTitle,
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
	<AlertDialogContent class="w-[95vw] max-w-2xl h-auto max-h-[90vh] sm:max-h-[85vh] rounded-xl sm:rounded-lg grid grid-rows-[auto_1fr_auto] p-0 overflow-hidden shadow-2xl border-none pointer-events-auto">
		<!-- Fixed Header (Row 1) -->
		<div class="px-5 sm:px-6 pt-5 pb-4 border-b bg-background z-30">
			<div class="flex flex-row items-start justify-between gap-4">
				<div class="flex-1 min-w-0 text-left">
					<AlertDialogTitle class="text-lg sm:text-2xl font-bold tracking-tight wrap-break-word">
						{currentEntry.title}
					</AlertDialogTitle>
					<AlertDialogDescription class="mt-1 text-xs sm:text-sm font-medium opacity-70">
						Version {currentEntry.version} • {currentEntry.date}
					</AlertDialogDescription>
				</div>
				<button
					onclick={handleClose}
					class="shrink-0 p-1.5 -mt-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
					aria-label="Close"
				>
					<X class="h-5 w-5 sm:h-6 sm:w-6" />
				</button>
			</div>
		</div>

		<!-- Scrollable Content (Row 2) -->
		<div class="relative bg-background overflow-hidden min-h-37.5">
			<div
				bind:this={scrollContainer}
				onscroll={handleScroll}
				class="h-full w-full overflow-y-auto overflow-x-hidden scroll-container overscroll-contain"
				style="scrollbar-gutter: stable;"
			>
				<div class="px-5 sm:px-8 py-4 sm:py-6 pb-20">
					<div class="space-y-3 sm:space-y-4">
						{#each currentEntry.items as item}
							<div class="flex gap-3 sm:gap-4 items-start group">
								<div class="mt-2 h-1.5 w-1.5 sm:h-2 sm:w-2 shrink-0 rounded-full bg-primary ring-2 ring-primary/10 group-hover:scale-110 transition-transform"></div>
								<p class="text-xs sm:text-base leading-relaxed text-foreground/90 font-medium">{item}</p>
							</div>
						{/each}
					</div>
				</div>
			</div>
				
			<!-- Scroll Hint Indicator - Overlay -->
			{#if showScrollHint}
				<div class="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background via-background/95 to-transparent pointer-events-none z-20 flex flex-col items-center justify-end pb-4 transition-opacity duration-500">
					<div class="flex flex-col items-center gap-1.5 animate-bounce">
						<span class="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em]" style="color: {$systemSettings.primaryColor}">Scroll for more</span>
						<ChevronDown class="h-4 w-4 sm:h-5 sm:w-5" style="color: {$systemSettings.primaryColor}" />
					</div>
				</div>
			{/if}
		</div>

		<!-- Fixed Footer (Row 3) -->
		<div class="px-5 sm:px-6 py-4 border-t bg-background z-30">
			<div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-between items-stretch sm:items-center">
				<div class="flex gap-2">
					<Button
						variant="outline"
						onclick={handlePrevious}
						disabled={isFirst}
						class="text-xs sm:text-sm flex-1 sm:flex-none"
					>
						Previous
					</Button>
					<Button
						variant="outline"
						onclick={handleNext}
						disabled={isLast}
						class="text-xs sm:text-sm flex-1 sm:flex-none gap-2"
					>
						Next
						<ChevronDown class="h-4 w-4 rotate-90" />
					</Button>
				</div>
				<div class="flex gap-2">
					<Button
						variant="outline"
						onclick={handleDontShowAgain}
						class="text-xs sm:text-sm flex-1 sm:flex-none"
					>
						Don't Show Again
					</Button>
					<Button
						onclick={handleClose}
						class="text-xs sm:text-sm flex-1 sm:flex-none"
					>
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
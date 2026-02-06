<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogHeader,
		AlertDialogTitle,
	} from '$lib/components/ui/alert-dialog';
	import ScrollArea from '$lib/components/ui/scroll/scroll-area.svelte';
	import { X, ChevronDown } from 'lucide-svelte';
	import { systemSettings } from '$lib/stores/settings';
	import type { ChangelogEntry } from '$lib/config/changelog';

	interface Props {
		open?: boolean;
		entry?: ChangelogEntry;
	}

	let { open = $bindable(false), entry }: Props = $props();
	let showScrollHint = $state(false);
	let scrollContainer: HTMLDivElement | undefined;

	function handleDontShowAgain() {
		if (entry) {
			if (typeof window !== 'undefined') {
				localStorage.setItem('lastSeenVersion', entry.version);
			}
		}
		open = false;
	}

	function handleClose() {
		open = false;
	}

	function handleScroll(e: Event) {
		if (!scrollContainer) return;
		const target = e.target as HTMLDivElement;
		const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 10;
		showScrollHint = !isNearBottom && target.scrollTop === 0;
	}

	function checkScrollHint() {
		if (!scrollContainer) return;
		const hasOverflow = scrollContainer.scrollHeight > scrollContainer.clientHeight;
		showScrollHint = hasOverflow && scrollContainer.scrollTop === 0;
	}
</script>

<AlertDialog bind:open>
	<AlertDialogContent class="w-[95vw] max-w-2xl min-h-auto max-h-[90vh] sm:max-h-[85vh] rounded-xl sm:rounded-lg flex flex-col p-0">
		<!-- Fixed Header -->
		<div class="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 border-b">
			<div class="flex flex-row items-start justify-between gap-4">
				<div class="flex-1 min-w-0 text-left">
					<AlertDialogTitle class="text-lg sm:text-2xl break-words">
						{entry?.title || 'What\'s New'}
					</AlertDialogTitle>
					<AlertDialogDescription class="mt-2 text-xs sm:text-sm">
						Version {entry?.version} • {entry?.date}
					</AlertDialogDescription>
				</div>
				<button
					onclick={handleClose}
					class="shrink-0 p-1 -mt-1 text-muted-foreground hover:text-foreground transition-colors"
					aria-label="Close"
				>
					<X class="h-5 w-5 sm:h-6 sm:w-6" />
				</button>
			</div>
		</div>

		<!-- Scrollable Content -->
		<div class="flex-1 min-h-0 relative overflow-hidden">
			<div
				bind:this={scrollContainer}
				onscroll={handleScroll}
				onload={checkScrollHint}
				class="relative overflow-auto h-full scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
			>
				<div class="px-4 sm:px-6 py-4 sm:py-4">
					<div class="space-y-2 sm:space-y-3">
						{#if entry?.items}
							{#each entry.items as item}
								<div class="flex gap-2 sm:gap-3">
									<div class="mt-1.5 h-1.5 w-1.5 sm:h-2 sm:w-2 shrink-0 rounded-full bg-primary"></div>
									<p class="text-xs sm:text-sm leading-relaxed text-foreground">{item}</p>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>

			<!-- Scroll Hint Indicator -->
			{#if showScrollHint}
				<div class="absolute bottom-0 left-0 right-0 flex items-center justify-center pointer-events-none bg-gradient-to-t from-background via-background/80 to-transparent pt-8 pb-4">
					<div class="flex flex-col items-center gap-1 animate-bounce">
						<span class="text-xs font-medium" style="color: {$systemSettings.primaryColor}">Scroll for more</span>
						<ChevronDown class="h-4 w-4" style="color: {$systemSettings.primaryColor}" />
					</div>
				</div>
			{/if}
		</div>

		<!-- Fixed Footer -->
		<div class="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-4 border-t">
			<div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-end">
				<Button variant="outline" onclick={handleDontShowAgain} class="text-xs sm:text-sm w-full sm:w-auto">
					Don't Show Again
				</Button>
				<Button onclick={handleClose} class="text-xs sm:text-sm w-full sm:w-auto">
					Continue
				</Button>
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

	/* Scrollbar styling */
	:global(.scrollbar-thin::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}

	:global(.scrollbar-thumb-muted::-webkit-scrollbar-thumb) {
		background-color: rgba(0, 0, 0, 0.08);
		border-radius: 8px;
	}

	:global(.scrollbar-track-transparent::-webkit-scrollbar-track) {
		background: transparent;
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

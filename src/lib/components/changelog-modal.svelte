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
	import { X } from 'lucide-svelte';
	import type { ChangelogEntry } from '$lib/config/changelog';

	interface Props {
		open?: boolean;
		entry?: ChangelogEntry;
	}

	let { open = $bindable(false), entry }: Props = $props();

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
</script>

<AlertDialog bind:open>
	<AlertDialogContent class="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl sm:rounded-lg">
		<AlertDialogHeader>
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
		</AlertDialogHeader>

		<div class="my-4 pr-2 sm:pr-0">
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

		<div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-end pt-4 border-t">
			<Button variant="outline" onclick={handleDontShowAgain} class="text-xs sm:text-sm w-full sm:w-auto">
				Don't Show Again
			</Button>
			<Button onclick={handleClose} class="text-xs sm:text-sm w-full sm:w-auto">
				Continue
			</Button>
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
</style>

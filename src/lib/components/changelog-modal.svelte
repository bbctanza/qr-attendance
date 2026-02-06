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
	<AlertDialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
		<AlertDialogHeader>
			<div class="flex items-center justify-between">
				<div>
					<AlertDialogTitle class="text-2xl">
						{entry?.title || 'What\'s New'}
					</AlertDialogTitle>
					<AlertDialogDescription class="mt-2">
						Version {entry?.version} • {entry?.date}
					</AlertDialogDescription>
				</div>
				<button
					onclick={handleClose}
					class="text-muted-foreground hover:text-foreground"
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
		</AlertDialogHeader>

		<div class="my-4">
			<div class="space-y-3">
				{#if entry?.items}
					{#each entry.items as item}
						<div class="flex gap-3">
							<div class="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"></div>
							<p class="text-sm leading-relaxed text-foreground">{item}</p>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<div class="flex gap-3 justify-end pt-4 border-t">
			<Button variant="outline" onclick={handleDontShowAgain}>
				Don't Show Again
			</Button>
			<Button onclick={handleClose}>
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

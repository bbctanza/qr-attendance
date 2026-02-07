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
	import { ChevronDown } from 'lucide-svelte';
	import { changelog } from '$lib/config/changelog';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();
	let currentIndex = $state(0);

	const currentEntry = $derived(changelog[currentIndex]);
	const isFirst = $derived(currentIndex === 0);
	const isLast = $derived(currentIndex === changelog.length - 1);

	function handleNext() {
		if (!isLast) {
			currentIndex++;
		}
	}

	function handlePrevious() {
		if (!isFirst) {
			currentIndex--;
		}
	}

	function handleClose() {
		open = false;
	}
</script>

<AlertDialog bind:open onOpenChange={() => (currentIndex = 0)}>
	<AlertDialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
		<AlertDialogHeader>
			<div>
				<AlertDialogTitle class="text-2xl">{currentEntry.title}</AlertDialogTitle>
				<p class="text-sm text-muted-foreground mt-2">
					Version {currentEntry.version} • {currentEntry.date}
				</p>
			</div>
		</AlertDialogHeader>

		<AlertDialogDescription class="space-y-4">
			<ul class="space-y-3">
				{#each currentEntry.items as item}
					<li class="flex gap-3 text-foreground">
						<span class="text-primary mt-1">•</span>
						<span class="text-sm leading-relaxed">{item}</span>
					</li>
				{/each}
			</ul>
		</AlertDialogDescription>

		<div class="flex gap-3 justify-between pt-4 border-t border-border/20">
			<div class="flex gap-2">
				<Button
					variant="outline"
					onclick={handlePrevious}
					disabled={isFirst}
					class="gap-2"
				>
					Previous
				</Button>
				<Button
					variant="outline"
					onclick={handleNext}
					disabled={isLast}
					class="gap-2"
				>
					Next
					<ChevronDown class="h-4 w-4 rotate-90" />
				</Button>
			</div>
			<AlertDialogAction onclick={handleClose}>
				Continue
			</AlertDialogAction>
		</div>
	</AlertDialogContent>
</AlertDialog>
     
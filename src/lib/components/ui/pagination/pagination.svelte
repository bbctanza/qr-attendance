<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-svelte';

	interface Props {
		currentPage: number;
		totalItems: number;
		itemsPerPage: number;
		onPageChange?: (page: number) => void;
	}

	let { currentPage = 1, totalItems = 0, itemsPerPage = 5, onPageChange }: Props = $props();

	const totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

	// Generate page numbers to display
	const pageNumbers = $derived.by(() => {
		const delta = 2;
		const range = [];
		const rangeWithDots = [];

		// Always add first page
		range.push(1);

		// Add numbers before current page
		for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
			range.push(i);
		}

		// Always add last page
		if (totalPages > 1) {
			range.push(totalPages);
		}

		let prevNum = 0;
		for (const num of range) {
			if (num - prevNum === 2) {
				rangeWithDots.push(prevNum + 1);
			} else if (num - prevNum !== 1) {
				rangeWithDots.push('...');
			}
			rangeWithDots.push(num);
			prevNum = num;
		}

		return rangeWithDots;
	});

	function handlePrevious() {
		if (currentPage > 1) {
			onPageChange?.(currentPage - 1);
		}
	}

	function handleNext() {
		if (currentPage < totalPages) {
			onPageChange?.(currentPage + 1);
		}
	}

	function handlePageClick(page: number) {
		onPageChange?.(page);
	}
</script>

<div class="flex items-center justify-center gap-2 py-4">
	<Button
		variant="outline"
		size="sm"
		disabled={currentPage === 1}
		onclick={handlePrevious}
	>
		<ChevronLeft class="h-4 w-4" />
	</Button>

	{#each pageNumbers as item}
		{#if item === '...'}
			<span class="px-2 text-muted-foreground">
				{item}
			</span>
		{:else}
			<Button
				variant={currentPage === item ? 'default' : 'outline'}
				size="sm"
				class="w-9"
				onclick={() => handlePageClick(item as number)}
			>
				{item}
			</Button>
		{/if}
	{/each}

	<Button
		variant="outline"
		size="sm"
		disabled={currentPage === totalPages}
		onclick={handleNext}
	>
		<ChevronRight class="h-4 w-4" />
	</Button>

	<span class="text-sm text-muted-foreground ml-2">
		Page {currentPage} of {totalPages}
	</span>
</div>

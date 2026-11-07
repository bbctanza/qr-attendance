<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';

	/**
	 * The pagination footer, extracted so DataTable and the Members mobile list share one.
	 *
	 * Members' mobile tree had no pagination at all - the control lived inside the desktop
	 * branch - so a phone rendered every filtered member at once.
	 */
	let {
		page = $bindable(1),
		pageSize = $bindable(10),
		total,
		pageSizes = [10, 25, 50, 100],
		noun = 'rows'
	}: {
		page?: number;
		pageSize?: number;
		total: number;
		pageSizes?: number[];
		noun?: string;
	} = $props();

	let totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
</script>

<div
	class="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row sm:px-6"
>
	<div class="flex items-center gap-4 text-xs text-muted-foreground">
		<span class="tabular-nums">
			<strong>{Math.min((page - 1) * pageSize + 1, total)}</strong>–<strong
				>{Math.min(page * pageSize, total)}</strong
			>
			of <strong>{total}</strong>
			{noun}
		</span>
		<div class="flex items-center gap-1.5">
			<span class="hidden sm:inline">Per page:</span>
			<Select.Root
				type="single"
				value={String(pageSize)}
				onValueChange={(value) => {
					pageSize = Number(value);
					page = 1;
				}}
			>
				<Select.Trigger size="sm" class="h-8 w-[4.5rem] px-2.5 text-xs" aria-label="Rows per page">
					{pageSize}
				</Select.Trigger>
				<Select.Content>
					{#each pageSizes as size (size)}
						<Select.Item value={String(size)} label={String(size)}>{size}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="flex items-center gap-2">
		<!-- Labelled explicitly: the text beside the chevron is hidden below `sm`, which
		     left these buttons with no accessible name on exactly the screens where they
		     are hardest to hit. -->
		<Button
			variant="outline"
			size="sm"
			aria-label="Previous page"
			class="h-8 gap-1 px-3 text-xs"
			disabled={page === 1}
			onclick={() => (page = Math.max(1, page - 1))}
		>
			<ChevronLeft class="h-3.5 w-3.5" />
			<span class="hidden sm:inline">Previous</span>
		</Button>
		<span class="px-1 text-xs font-medium text-muted-foreground tabular-nums">
			{page} / {totalPages}
		</span>
		<Button
			variant="outline"
			size="sm"
			aria-label="Next page"
			class="h-8 gap-1 px-3 text-xs"
			disabled={page >= totalPages}
			onclick={() => (page = Math.min(totalPages, page + 1))}
		>
			<span class="hidden sm:inline">Next</span>
			<ChevronRight class="h-3.5 w-3.5" />
		</Button>
	</div>
</div>

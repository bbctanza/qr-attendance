<script lang="ts" generics="Row">
	import type { Snippet } from 'svelte';
	import { ArrowDown, ArrowUp, Inbox } from '@lucide/svelte';
	import * as Table from '$lib/components/ui/table';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import EmptyState from '$lib/components/common/empty-state.svelte';
	import Pagination from './pagination.svelte';
	import { HIDE_BELOW_CLASS, type Column } from './types';

	/**
	 * One table, two renderings.
	 *
	 * A `<table>` from `md` up, and a stack of cards below it, both generated from the same
	 * column array. Tables do not work on a phone: Audit Logs rendered six columns at 400px
	 * inside a horizontal scroller, and Access rendered four. A card per row removes sideways
	 * scrolling entirely.
	 *
	 * Owns the frame, header, hover, loading skeleton, empty state and pagination, because
	 * the four pages that had their own had four different versions of each.
	 *
	 * No `overflow-x-auto` here: the Table primitive already wraps itself in one, and the two
	 * pages that added their own ended up with nested scrollers.
	 */
	let {
		columns,
		rows,
		rowKey,
		isLoading = false,
		page = $bindable(1),
		pageSize = $bindable(10),
		paginate = true,
		pageSizes = [10, 25, 50, 100],
		noun = 'rows',
		emptyTitle = 'Nothing to show',
		emptyDescription = null,
		caption = null,
		sortKey = null,
		sortDirection = 'asc',
		onSort = undefined,
		mobileCard = undefined,
		groupBy = undefined
	}: {
		columns: Column<Row>[];
		rows: Row[];
		rowKey: (row: Row) => string | number;
		isLoading?: boolean;
		page?: number;
		pageSize?: number;
		paginate?: boolean;
		pageSizes?: number[];
		/** Plural noun for the footer count, e.g. "members". */
		noun?: string;
		emptyTitle?: string;
		emptyDescription?: string | null;
		/** Screen-reader description of the table. */
		caption?: string | null;
		/** Column key currently sorted by, or null. */
		sortKey?: string | null;
		sortDirection?: 'asc' | 'desc';
		/**
		 * Called with a column key when its header is activated. Sorting stays the page's job -
		 * it owns the comparator - but the control lives here so it looks the same everywhere.
		 */
		onSort?: ((key: string) => void) | undefined;
		/**
		 * Draws the whole mobile card for a row, replacing the default title/subtitle/labelled-
		 * value layout.
		 *
		 * The default card is right when a row is a bag of fields, which is what Audit Logs
		 * and Overview are. It is wrong when a row is a person: Access wants an avatar, a
		 * status-coloured edge and one quiet meta line, not `Role: Staff` on its own row.
		 * Rather than grow a prop per ornament, the page draws its own card and DataTable
		 * keeps what is genuinely shared - the breakpoint, pagination, grouping, the skeleton
		 * and the empty state.
		 *
		 * Supplying this also drops the outer frame below `md`, since the cards carry their
		 * own and a card of cards is one border too many.
		 */
		mobileCard?: Snippet<[Row]>;
		/**
		 * Section heading for a row in the mobile list, or null for no heading.
		 *
		 * Headings appear wherever the value changes, so the rows must already be ordered by
		 * it - this groups a sorted list, it does not sort one. Mobile only: the table has
		 * column headers and sortable columns doing this job.
		 */
		groupBy?: ((row: Row) => string | null) | undefined;
	} = $props();

	let visible = $derived(
		paginate ? rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize) : rows
	);

	/**
	 * Settle on one behaviour: filtering sends you back to the first page.
	 *
	 * Members and Audit Logs did this; Access instead clamped the page down, which can leave
	 * you looking at the tail of a filtered set wondering where the matches went.
	 */
	let lastCount = $state(-1);
	$effect(() => {
		if (rows.length !== lastCount) {
			lastCount = rows.length;
			if (page !== 1) page = 1;
		}
	});

	/**
	 * The frame belongs to the table. A page that draws its own mobile cards gets no frame
	 * below `md`, so the cards sit on the page background rather than inside a second box.
	 */
	let frameClass = $derived(
		mobileCard
			? 'md:overflow-hidden md:rounded-xl md:border md:bg-card md:text-card-foreground md:shadow-xs'
			: 'overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs'
	);

	/** The visible rows, each tagged with the heading to print before it (if any). */
	let visibleGrouped = $derived.by(() => {
		let previous: string | null = null;
		return visible.map((row) => {
			const group = groupBy?.(row) ?? null;
			const heading = group !== null && group !== previous ? group : null;
			previous = group;
			return { row, heading };
		});
	});

	let tableColumns = $derived(columns);
	let titleColumn = $derived(columns.find((c) => c.as === 'title'));
	let subtitleColumn = $derived(columns.find((c) => c.as === 'subtitle'));
	let actionsColumn = $derived(columns.find((c) => c.as === 'actions'));
	/** Everything not promoted into the card heading becomes a labelled value row. */
	let detailColumns = $derived(columns.filter((c) => c.mobile !== false && !c.as));

	function headClass(column: Column<Row>) {
		return [
			'px-4 text-xs font-semibold text-muted-foreground sm:px-6',
			column.width ?? '',
			column.align === 'right' ? 'text-right' : '',
			column.nowrap ? 'whitespace-nowrap' : '',
			column.hideBelow ? HIDE_BELOW_CLASS[column.hideBelow] : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	function cellClass(column: Column<Row>) {
		return [
			'px-4 py-3 align-middle sm:px-6',
			column.align === 'right' ? 'text-right' : '',
			column.nowrap ? 'whitespace-nowrap' : '',
			column.hideBelow ? HIDE_BELOW_CLASS[column.hideBelow] : ''
		]
			.filter(Boolean)
			.join(' ');
	}
</script>

{#snippet footer()}
	{#if paginate && rows.length > 0}
		<Pagination bind:page bind:pageSize total={rows.length} {pageSizes} {noun} />
	{/if}
{/snippet}

<div class={frameClass}>
	{#if isLoading}
		<div class="divide-y divide-border/40" data-testid="data-table-skeleton">
			{#each ['a', 'b', 'c', 'd', 'e', 'f'] as key (key)}
				<div class="flex items-center gap-4 px-4 py-3.5 sm:px-6">
					<Skeleton class="h-4 w-28 shrink-0" />
					<Skeleton class="h-4 flex-1" />
					<Skeleton class="hidden h-4 w-24 shrink-0 sm:block" />
				</div>
			{/each}
		</div>
	{:else if rows.length === 0}
		<div class="p-4">
			<EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} compact />
		</div>
	{:else}
		<!-- Desktop: a real table. -->
		<div class="hidden md:block" data-testid="data-table-rows">
			<Table.Root>
				{#if caption}<Table.Caption class="sr-only">{caption}</Table.Caption>{/if}
				<Table.Header>
					<Table.Row class="bg-muted/50 hover:bg-muted/50">
						{#each tableColumns as column (column.key)}
							<Table.Head class={headClass(column)}>
								{#if column.as === 'actions'}
									<span class="sr-only">{column.header}</span>
								{:else if column.sortable && onSort}
									<button
										type="button"
										class="-ml-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-semibold transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
										aria-label="Sort by {column.header}"
										onclick={() => onSort?.(column.key)}
									>
										{column.header}
										{#if sortKey === column.key}
											{#if sortDirection === 'asc'}
												<ArrowUp class="h-3.5 w-3.5 text-primary" />
											{:else}
												<ArrowDown class="h-3.5 w-3.5 text-primary" />
											{/if}
										{/if}
									</button>
								{:else}
									{column.header}
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each visible as row (rowKey(row))}
						<Table.Row class="transition-colors duration-150 motion-reduce:transition-none">
							{#each tableColumns as column (column.key)}
								<Table.Cell class={cellClass(column)}>
									{@render column.cell(row)}
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<!-- Mobile: one card per row, so nothing scrolls sideways. -->
		<ul
			class={mobileCard ? 'flex flex-col gap-2 md:hidden' : 'divide-y divide-border/40 md:hidden'}
			data-testid="data-table-cards"
		>
			{#each visibleGrouped as { row, heading } (rowKey(row))}
				{#if heading}
					<!--
						Not a <li>: a heading is not one of the list's items, and announcing it as one
						misreports the count to a screen reader. `display: contents` lets the wrapper
						carry the role without taking part in the layout.
					-->
					<div role="presentation" class="contents">
						<h3
							class="px-1 pt-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase first:pt-0"
							data-testid="data-table-group"
						>
							{heading}
						</h3>
					</div>
				{/if}
				{#if mobileCard}
					<li class="min-w-0">{@render mobileCard(row)}</li>
				{:else}
					<li class="flex min-w-0 flex-col gap-3 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								{#if titleColumn}
									<div class="text-sm font-semibold [overflow-wrap:anywhere]">
										{@render titleColumn.cell(row)}
									</div>
								{/if}
								{#if subtitleColumn}
									<div class="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground">
										{@render subtitleColumn.cell(row)}
									</div>
								{/if}
							</div>
							{#if actionsColumn}
								<div class="shrink-0">{@render actionsColumn.cell(row)}</div>
							{/if}
						</div>

						{#if detailColumns.length > 0}
							<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
								{#each detailColumns as column (column.key)}
									<dt class="text-muted-foreground">{column.header}</dt>
									<!-- min-w-0 so a long value shrinks instead of widening the card past
									     the screen, which is what an unbroken email address does. -->
									<dd class="min-w-0 text-right font-medium [overflow-wrap:anywhere]">
										{@render column.cell(row)}
									</dd>
								{/each}
							</dl>
						{/if}
					</li>
				{/if}
			{/each}
		</ul>
	{/if}

	{@render footer()}
</div>

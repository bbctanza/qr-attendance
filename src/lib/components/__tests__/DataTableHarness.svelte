<script lang="ts">
	import { DataTable, type Column } from '$lib/components/data-table';

	interface Row {
		id: number;
		name: string;
		email: string;
		role: string;
		seen: string;
	}

	let {
		rows = [],
		isLoading = false,
		pageSize = 10,
		/** Opt into the page-drawn mobile card instead of the default field list. */
		customCard = false,
		/** Opt into mobile section headings. Rows must already be ordered by the group. */
		grouped = false,
		/** Constrains the card column, so overflow can be measured at phone width. */
		width = ''
	} = $props();

	const columns: Column<Row>[] = [
		{ key: 'name', header: 'Person', as: 'title', cell: name },
		{ key: 'email', header: 'Email', as: 'subtitle', cell: email },
		{ key: 'role', header: 'Role', cell: role },
		{ key: 'seen', header: 'Last active', hideBelow: 'lg', cell: seen },
		{ key: 'internal', header: 'Internal', mobile: false, cell: internal },
		{ key: 'actions', header: 'Actions', as: 'actions', align: 'right', cell: actions }
	];
</script>

{#snippet name(row: Row)}{row.name}{/snippet}
{#snippet email(row: Row)}{row.email}{/snippet}
{#snippet role(row: Row)}{row.role}{/snippet}
{#snippet seen(row: Row)}{row.seen}{/snippet}
{#snippet internal(row: Row)}<span data-testid="internal-{row.id}">#{row.id}</span>{/snippet}
{#snippet actions(row: Row)}<button data-testid="act-{row.id}">⋮</button>{/snippet}

{#snippet personCard(row: Row)}
	<div class="flex overflow-hidden rounded-xl border bg-card" data-testid="custom-card-{row.id}">
		<div class="w-1 shrink-0 bg-primary" aria-hidden="true"></div>
		<div class="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3">
			<div class="h-10 w-10 rounded-full bg-muted"></div>
			<div class="min-w-0">
				<div class="truncate text-sm font-semibold">{row.name}</div>
				<div class="truncate text-xs text-muted-foreground">{row.email}</div>
			</div>
			<button data-testid="card-act-{row.id}">⋮</button>
		</div>
	</div>
{/snippet}

<div style={width ? `width: ${width}` : ''} data-testid="viewport">
	<DataTable
		{columns}
		{rows}
		{isLoading}
		{pageSize}
		rowKey={(r: Row) => r.id}
		noun="people"
		emptyTitle="No one here"
		mobileCard={customCard ? personCard : undefined}
		groupBy={grouped ? (r: Row) => r.role : undefined}
	/>
</div>

import type { Snippet } from 'svelte';

/**
 * One column, describing a field once for both renderings.
 *
 * The point of a single definition is that the desktop table and the mobile card cannot
 * disagree about what a row contains. Before this, two of the four table pages had no
 * mobile rendering at all and the other two had hand-rolled ones that had already drifted
 * from their tables.
 */
export interface Column<Row> {
	/** Stable identity for keyed iteration. */
	key: string;
	/** Column heading, and the label beside the value in the mobile card. */
	header: string;
	/** Renders the cell. Receives the row. */
	cell: Snippet<[Row]>;

	/**
	 * Drop this column from the table below the given breakpoint. It still appears in the
	 * mobile card, so narrowing the table never loses information.
	 */
	hideBelow?: 'sm' | 'md' | 'lg';

	/**
	 * Promote the field in the mobile card instead of listing it as a labelled value.
	 * `title` and `subtitle` form the card heading; `actions` is pinned top-right.
	 */
	as?: 'title' | 'subtitle' | 'actions';

	/** Leave out of the mobile card - usually because the title already carries it. */
	mobile?: false;

	/** Render a sort control in this column's header. Keyed on `key`. */
	sortable?: boolean;
	align?: 'left' | 'right';
	/** Opt back in to nowrap for things that must not break, like timestamps and IDs. */
	nowrap?: boolean;
	/** Tailwind width class for the table column, e.g. `w-36`. */
	width?: string;
}

export const HIDE_BELOW_CLASS = {
	sm: 'hidden sm:table-cell',
	md: 'hidden md:table-cell',
	lg: 'hidden lg:table-cell'
} as const;

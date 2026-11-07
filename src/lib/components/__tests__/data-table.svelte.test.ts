// The layout assertions below measure real geometry, so the real stylesheet has to be
// loaded - without it every Tailwind class is inert and the measurements are meaningless.
import '../../../routes/layout.css';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Harness from './DataTableHarness.svelte';

const settle = () => new Promise((r) => setTimeout(r, 200));

const makeRows = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: i + 1,
		name: `Person ${i + 1}`,
		// A deliberately long unbroken string: this is what used to push cards past the screen.
		email: `averyveryverylongemailaddress${i + 1}@someorganisationdomain.example.com`,
		role: 'Staff',
		seen: '2h ago'
	}));

describe('DataTable renderings', () => {
	it('renders both a table and a card list, each hidden at the other breakpoint', async () => {
		// This used to assert class strings, on the belief that the harness could not resize
		// the real viewport. It can - `page.viewport()` works here - so the breakpoint is
		// measured instead. A class string cannot tell you the breakpoint actually fires.
		render(Harness, { rows: makeRows(3) });
		await settle();

		const table = document.querySelector('table');
		const desktop = document.querySelector('[data-testid="data-table-rows"]') as HTMLElement;
		const cards = document.querySelector('[data-testid="data-table-cards"]') as HTMLElement;
		expect(table).not.toBeNull();
		expect(desktop.contains(table)).toBe(true);

		await page.viewport(1280, 800);
		await settle();
		expect(getComputedStyle(desktop).display, 'table hidden on desktop').not.toBe('none');
		expect(getComputedStyle(cards).display, 'cards shown on desktop').toBe('none');

		await page.viewport(390, 760);
		await settle();
		expect(getComputedStyle(desktop).display, 'table shown on a phone').toBe('none');
		expect(getComputedStyle(cards).display, 'cards hidden on a phone').not.toBe('none');

		await page.viewport(1280, 800);
	});

	it('promotes title and subtitle into the card heading', async () => {
		render(Harness, { rows: makeRows(1) });
		await settle();

		const card = document.querySelector('[data-testid="data-table-cards"] li');
		expect(card?.textContent).toContain('Person 1');
		expect(card?.textContent).toContain('@someorganisationdomain.example.com');
	});

	it('omits mobile:false columns from the card but keeps them in the table', async () => {
		render(Harness, { rows: makeRows(1) });
		await settle();

		const cards = document.querySelector('[data-testid="data-table-cards"]');
		const table = document.querySelector('table');

		expect(cards?.textContent).not.toContain('Internal');
		expect(table?.textContent).toContain('Internal');
	});

	it('labels every detail value in the card', async () => {
		render(Harness, { rows: makeRows(1) });
		await settle();

		const terms = [...document.querySelectorAll('[data-testid="data-table-cards"] dt')].map((n) =>
			n.textContent?.trim()
		);
		// Role and Last active are details; Person/Email/Actions are promoted; Internal opted out.
		expect(terms).toEqual(['Role', 'Last active']);
	});

	it('hides a hideBelow column in the table at narrow widths only', async () => {
		render(Harness, { rows: makeRows(1) });
		await settle();

		const head = [...document.querySelectorAll('th')].find((n) =>
			n.textContent?.includes('Last active')
		);
		expect(head?.className).toContain('hidden');
		expect(head?.className).toContain('lg:table-cell');
		// Still present on the card, so narrowing never loses the field.
		expect(document.querySelector('[data-testid="data-table-cards"]')?.textContent).toContain(
			'Last active'
		);
	});
});

describe('DataTable states', () => {
	it('shows a skeleton while loading and no rows', async () => {
		render(Harness, { rows: [], isLoading: true });
		await settle();

		expect(document.querySelector('[data-testid="data-table-skeleton"]')).not.toBeNull();
		expect(document.querySelector('table')).toBeNull();
	});

	it('shows the empty state for zero rows', async () => {
		render(Harness, { rows: [] });
		await settle();

		expect(document.body.innerText).toContain('No one here');
		expect(document.querySelector('table')).toBeNull();
	});
});

describe('DataTable pagination', () => {
	it('pages the rows and reports the range', async () => {
		render(Harness, { rows: makeRows(25), pageSize: 10 });
		await settle();

		expect(document.querySelectorAll('tbody tr')).toHaveLength(10);
		expect(document.body.innerText).toContain('1');
		expect(document.body.innerText).toContain('25');
		expect(document.body.innerText).toContain('people');
	});

	it('disables Previous on the first page and advances with Next', async () => {
		const screen = render(Harness, { rows: makeRows(25), pageSize: 10 });
		await settle();

		// By aria-label, not visible text: the text is hidden below `sm`.
		const prev = screen.getByRole('button', { name: 'Previous page' });
		await expect.element(prev).toBeDisabled();

		await screen.getByRole('button', { name: 'Next page' }).click();
		await settle();

		expect(document.body.innerText).toContain('2 / 3');
	});

	it('does not render pagination when there are no rows', async () => {
		render(Harness, { rows: [] });
		await settle();
		expect(document.body.innerText).not.toContain('Per page');
	});
});

describe('DataTable overflow', () => {
	it('does not let a long unbroken value widen the page', async () => {
		// The actual requirement: a card must never exceed the screen. An email with no spaces
		// is the thing that used to do it.
		render(Harness, { rows: makeRows(5) });
		await settle();

		const cards = document.querySelector('[data-testid="data-table-cards"]') as HTMLElement;
		expect(cards.scrollWidth).toBeLessThanOrEqual(cards.clientWidth + 1);
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
			document.documentElement.clientWidth + 1
		);
	});
});

describe('DataTable mobile cards', () => {
	it('renders the page-supplied card instead of the default field list', async () => {
		render(Harness, { rows: makeRows(2), customCard: true });
		await settle();

		expect(document.querySelector('[data-testid="custom-card-1"]')).not.toBeNull();
		// The default card's labelled-value grid must not also be drawn.
		expect(document.querySelector('[data-testid="data-table-cards"] dl')).toBeNull();
	});

	it('still renders the real table for desktop alongside it', async () => {
		render(Harness, { rows: makeRows(2), customCard: true });
		await settle();

		// A custom mobile card replaces the mobile rendering only - the table is untouched.
		const rows = document.querySelectorAll('[data-testid="data-table-rows"] tbody tr');
		expect(rows).toHaveLength(2);
	});

	it('drops the outer frame below md so cards are not boxed inside a box', async () => {
		render(Harness, { rows: makeRows(1), customCard: true });
		await settle();

		const frame = document.querySelector('[data-testid="data-table-cards"]')!
			.parentElement as HTMLElement;
		// Border and radius are md-prefixed, so they are inert at phone width.
		expect(frame.className).toContain('md:rounded-xl');
		expect(frame.className).not.toMatch(/(^|\s)rounded-xl/);
		expect(frame.className).not.toMatch(/(^|\s)border(\s|$)/);
	});

	it('keeps the frame when the default card is used', async () => {
		render(Harness, { rows: makeRows(1) });
		await settle();

		const frame = document.querySelector('[data-testid="data-table-cards"]')!
			.parentElement as HTMLElement;
		expect(frame.className).toMatch(/(^|\s)rounded-xl/);
	});
});

describe('DataTable mobile grouping', () => {
	const grouped = () => [
		{ id: 1, name: 'A', email: 'a@x.test', role: 'Admin', seen: '1h' },
		{ id: 2, name: 'B', email: 'b@x.test', role: 'Admin', seen: '2h' },
		{ id: 3, name: 'C', email: 'c@x.test', role: 'Staff', seen: '3h' },
		{ id: 4, name: 'D', email: 'd@x.test', role: 'Staff', seen: '4h' }
	];

	it('prints one heading per run, not one per row', async () => {
		render(Harness, { rows: grouped(), grouped: true, customCard: true });
		await settle();

		const headings = [...document.querySelectorAll('[data-testid="data-table-group"]')].map(
			(h) => h.textContent?.trim()
		);
		expect(headings).toEqual(['Admin', 'Staff']);
	});

	it('does not count a heading as a list item', async () => {
		// A heading announced as one of four list items misreports the count to a screen reader.
		render(Harness, { rows: grouped(), grouped: true, customCard: true });
		await settle();

		const items = document.querySelectorAll('[data-testid="data-table-cards"] > li');
		expect(items).toHaveLength(4);
	});

	it('renders no headings when groupBy is absent', async () => {
		render(Harness, { rows: grouped(), customCard: true });
		await settle();

		expect(document.querySelectorAll('[data-testid="data-table-group"]')).toHaveLength(0);
	});
});

describe('DataTable mobile card sizing', () => {
	// 390px is an iPhone 14/15; the regression that prompted this work was a 517px card on a
	// 415px screen.
	//
	// These assertions were checked by breaking the harness on purpose, because a geometry
	// test that cannot fail is worse than no test. What each rule in the card actually does:
	//
	//   truncate on the text        load-bearing - removing it fails these tests
	//   minmax(0,1fr) on the track  a min-width floor; redundant with the next one
	//   min-w-0 on the grid item    the same floor again; removing EITHER alone passes,
	//                               removing BOTH fails
	//
	// So do not "simplify" by deleting both floors on the grounds that one looks unused.
	const PHONE = '390px';

	it('keeps a card inside the screen despite a long unbroken email', async () => {
		render(Harness, { rows: makeRows(3), customCard: true, width: PHONE });
		await settle();

		const viewport = document.querySelector('[data-testid="viewport"]') as HTMLElement;
		expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

		for (const card of document.querySelectorAll('[data-testid^="custom-card-"]')) {
			const el = card as HTMLElement;
			expect(el.scrollWidth, 'card is wider than its own box').toBeLessThanOrEqual(
				el.clientWidth
			);
			expect(el.getBoundingClientRect().width).toBeLessThanOrEqual(390);
		}
	});

	it('gives every card the same height', async () => {
		render(Harness, { rows: makeRows(4), customCard: true, width: PHONE });
		await settle();

		const heights = [...document.querySelectorAll('[data-testid^="custom-card-"]')].map(
			(c) => (c as HTMLElement).offsetHeight
		);
		expect(heights).toHaveLength(4);
		expect(new Set(heights).size, `heights were ${heights.join(', ')}`).toBe(1);
	});

	it('does not let the page scroll sideways', async () => {
		render(Harness, { rows: makeRows(6), customCard: true, width: PHONE });
		await settle();

		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
			document.documentElement.clientWidth
		);
	});
});

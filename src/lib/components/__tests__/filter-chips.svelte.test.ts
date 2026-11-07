// Geometry and class assertions, so the real stylesheet has to be loaded.
import '../../../routes/layout.css';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FilterChips from '../common/filter-chips.svelte';
import Harness from './FilterChipsHarness.svelte';

const settle = () => new Promise((r) => setTimeout(r, 200));

const options = [
	{ value: 'all', label: 'All', count: 14 },
	{ value: 'pending', label: 'Awaiting', count: 0 },
	{ value: 'admin', label: 'Admins', count: 2 },
	{ value: 'staff', label: 'Staff', count: 2 },
	{ value: 'guest', label: 'Guests', count: 0 },
	{ value: 'suspended', label: 'Suspended', count: 1 }
];

const chips = () => [...document.querySelectorAll('button[aria-pressed]')] as HTMLElement[];

describe('FilterChips', () => {
	it('renders one chip per option, each carrying its count', async () => {
		render(FilterChips, { options, value: 'all', label: 'Filter people' });
		await settle();

		const text = chips().map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
		expect(text).toEqual([
			'All 14',
			'Awaiting 0',
			'Admins 2',
			'Staff 2',
			'Guests 0',
			'Suspended 1'
		]);
	});

	it('marks exactly one chip pressed, which the tiles never did', async () => {
		render(FilterChips, { options, value: 'admin', label: 'Filter people' });
		await settle();

		const pressed = chips().filter((c) => c.getAttribute('aria-pressed') === 'true');
		expect(pressed).toHaveLength(1);
		expect(pressed[0].textContent).toContain('Admins');
	});

	it('keeps zero-count chips present and clickable rather than hiding them', async () => {
		// Hiding them would reshuffle the row under the user's thumb whenever the data moved.
		render(FilterChips, { options, value: 'all', label: 'Filter people' });
		await settle();

		const awaiting = chips().find((c) => c.textContent?.includes('Awaiting'))!;
		expect(awaiting).toBeDefined();
		expect(awaiting.hasAttribute('disabled')).toBe(false);
	});

	it('exposes the group to assistive tech by name', async () => {
		render(FilterChips, { options, value: 'all', label: 'Filter people' });
		await settle();

		const group = document.querySelector('[role="group"]');
		expect(group?.getAttribute('aria-label')).toBe('Filter people');
	});

	it('scrolls rather than wrapping, and fits the page inside its real container', async () => {
		// Rendered the way PageShell renders it: inside px-4, which is what the -mx-4 bleed
		// cancels against.
		render(Harness, { options, value: 'all' });
		await settle();

		const group = document.querySelector('[role="group"]') as HTMLElement;
		expect(getComputedStyle(group).overflowX).toBe('auto');
		// Six chips do not fit on a phone - the row must scroll, not wrap or overflow.
		expect(group.scrollWidth).toBeGreaterThan(group.clientWidth);
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
			document.documentElement.clientWidth
		);
	});

	it('bleeds exactly its container padding, so it reaches the screen edge', async () => {
		// The contract with the parent, asserted rather than assumed: the row is 32px wider
		// than the padded container it sits in, which is the 16px of padding on each side.
		render(Harness, { options, value: 'all' });
		await settle();

		const container = document.querySelector('[data-testid="container"]') as HTMLElement;
		const group = document.querySelector('[role="group"]') as HTMLElement;
		expect(group.getBoundingClientRect().width).toBeCloseTo(
			container.getBoundingClientRect().width,
			0
		);
	});
});

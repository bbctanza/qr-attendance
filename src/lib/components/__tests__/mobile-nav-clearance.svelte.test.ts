// Geometry assertions, so the real stylesheet must be loaded - without it every Tailwind
// class is inert and the numbers below mean nothing.
import '../../../routes/layout.css';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from './MobileNavHarness.svelte';

const settle = () => new Promise((r) => setTimeout(r, 200));

/** How far above the viewport bottom an element's top edge sits. */
const riseAbove = (el: Element) => window.innerHeight - el.getBoundingClientRect().top;

const find = (id: string) => document.querySelector(`[data-testid="${id}"]`)!;

describe('bottom nav clearance', () => {
	it('the scan FAB reaches higher than the nav bar', async () => {
		render(Harness);
		await settle();

		// The whole point. `-top-8` plus `ring-4` means the bar's height is not the height
		// of the chrome, which is what made pb-24 look sufficient when it was not.
		expect(riseAbove(find('fab'))).toBeGreaterThan(riseAbove(find('nav')));
	});

	it('clears the FAB, not merely the bar', async () => {
		render(Harness);
		await settle();

		const pad = parseFloat(getComputedStyle(find('main')).paddingBottom);
		expect(pad).toBeGreaterThanOrEqual(riseAbove(find('fab')));
	});

	it('keeps a footer row clear of the FAB at full scroll', async () => {
		render(Harness);
		await settle();

		window.scrollTo(0, document.body.scrollHeight);
		await settle();

		const fab = find('fab').getBoundingClientRect();

		// Both buttons, because the stacked mobile footer centres them - putting them in
		// the FAB's column, so vertical separation is the only thing protecting them.
		for (const id of ['prev', 'next']) {
			const btn = find(id).getBoundingClientRect();
			expect(btn.bottom, `${id} overlaps the scan button`).toBeLessThanOrEqual(fab.top);
		}
	});
});

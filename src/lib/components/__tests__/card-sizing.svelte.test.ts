// Geometry assertions, so the real stylesheet must be loaded.
import '../../../routes/layout.css';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from './CardGridHarness.svelte';

const settle = () => new Promise((r) => setTimeout(r, 200));

function cardHeights() {
	return [...document.querySelectorAll('[data-testid="grid"] > *')].map(
		(n) => (n as HTMLElement).offsetHeight
	);
}

describe('card grids', () => {
	it('gives cards in a row equal height', async () => {
		render(Harness);
		await settle();

		const heights = cardHeights();
		expect(heights).toHaveLength(3);
		expect(new Set(heights).size).toBe(1);
	});

	it('still equalises under auto-rows-max', async () => {
		// Checked because auto-rows-max was suspected of causing unequal cards. It does not:
		// the row track is sized to the tallest item and items stretch to the track either
		// way. Kept so the suspicion is not re-raised.
		render(Harness, { autoRowsMax: true });
		await settle();

		expect(new Set(cardHeights()).size).toBe(1);
	});

	it('keeps a grid of cards inside its container', async () => {
		render(Harness);
		await settle();

		const grid = document.querySelector('[data-testid="grid"]') as HTMLElement;
		expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth + 1);
	});
});

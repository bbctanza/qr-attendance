import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `MobileNavHarness.svelte` copies the nav's class strings so the geometry can be measured
 * without a router. A copy can drift from its original silently, and the clearance test
 * would then keep passing while measuring a nav that no longer exists. These assertions
 * are what make the copy trustworthy.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf-8');

describe('mobile nav geometry inputs', () => {
	it('the nav still sizes itself the way the harness assumes', () => {
		const nav = read('../mobile-nav.svelte');
		// Bar height comes from these three.
		expect(nav).toContain('px-4 pt-2 pb-6');
		expect(nav).toContain('fixed right-0 bottom-0 left-0 z-50');
	});

	it('the scan button still rises above the bar', () => {
		const nav = read('../mobile-nav.svelte');
		// If either of these goes, the clearance below is wrong in the other direction
		// and pb-32 is simply wasted space.
		expect(nav).toContain('-top-8');
		expect(nav).toContain('h-16 w-16');
		expect(nav).toContain('ring-4');
	});

	it('the layout clears the FAB rather than the bar', () => {
		const layout = read('../../../routes/+layout.svelte');
		expect(layout).toContain('pb-32 md:pb-0');
	});

	it('the harness mirrors the layout it stands in for', () => {
		const harness = read('./MobileNavHarness.svelte');
		expect(harness).toContain('pb-32');
		expect(harness).toContain('px-4 pt-2 pb-6');
		expect(harness).toContain('-top-8');
	});
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { automation } from './automation';

/**
 * Regression guard for a self-recursive log helper.
 *
 * A find-and-replace that rewrote `console.log` to `log` rewrote the body of the `log`
 * helper along with its call sites, so `log()` called itself. The first scheduler message
 * then blew the stack and took the whole app down with it.
 *
 * Exercising the logging path is the only thing that catches that - reading the file did
 * not, and neither did svelte-check, since infinite recursion is perfectly well-typed.
 */
describe('automation engine logging', () => {
	afterEach(() => {
		automation.stop();
		vi.restoreAllMocks();
	});

	it('starts and stops without recursing into its own logger', () => {
		// A self-recursive helper throws RangeError on the first message.
		vi.spyOn(console, 'log').mockImplementation(() => {});

		expect(() => automation.start()).not.toThrow();
		expect(() => automation.stop()).not.toThrow();
	});

	it('routes progress messages through console.log at most once each', () => {
		// Gated on `dev`, so this is 0 outside development and 1 inside - never more. More
		// than one per message is the signature of the recursion returning.
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

		automation.start();

		const started = spy.mock.calls.filter((call) => String(call[0]).includes('Engine Started'));
		expect(started.length).toBeLessThanOrEqual(1);
	});
});

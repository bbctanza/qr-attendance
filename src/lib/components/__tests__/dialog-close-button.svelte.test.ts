// Geometry assertions, so the real stylesheet has to be loaded - without it every Tailwind
// class is inert, absolute positioning does nothing, and the buttons just stack in document
// order. Caught exactly that way: the first version of this test, without the import,
// reported the close button sitting at the left edge instead of the corner.
import '../../../routes/layout.css';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from './DialogCloseHarness.svelte';

const settle = () => new Promise((r) => setTimeout(r, 200));

/**
 * The corner X is supplied by the Dialog/AlertDialog Content primitives themselves, so every
 * dialog in the app gets one automatically - including the ones (most of them) that already
 * have a footer Cancel or Close button. These tests live at the primitive, not per-page,
 * because that is where the behaviour actually lives: a page cannot opt out, and none should
 * need to hand-roll its own the way audit-logs used to.
 *
 * Only one overlay is ever opened per test. Two open at once is a real stacking fact, not a
 * test artifact - the later one's full-viewport backdrop intercepts clicks meant for the
 * first - but it is not what any of these assertions are about, so the harness keeps them
 * apart via `openDialog`/`openAlert` rather than each test working around the other.
 */
describe('dialog corner close button', () => {
	it('gives a plain Dialog a close button beyond its footer Cancel', async () => {
		const screen = render(Harness, { openDialog: true });
		await settle();

		await expect.element(screen.getByRole('button', { name: 'Close' })).toBeVisible();
	});

	it('closes the Dialog when the corner button is activated', async () => {
		const screen = render(Harness, { openDialog: true });
		const instance = (screen as unknown as { component: ReturnType<typeof Harness> })
			.component;
		await settle();

		await screen.getByRole('button', { name: 'Close' }).click();
		await settle();

		expect(instance.isDialogOpen()).toBe(false);
	});

	it('gives an AlertDialog a close button beyond its own footer Cancel', async () => {
		const screen = render(Harness, { openAlert: true });
		await settle();

		const content = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement;
		// Structural, not a role query: the footer's own Cancel button shares the accessible
		// name "Cancel" with the corner one. The corner button's position - last child of
		// Content - is what is actually unambiguous.
		const corner = content.querySelector(':scope > button:last-of-type');
		expect(corner).not.toBeNull();
		expect(corner?.textContent?.trim()).toBe('Cancel');
	});

	it('resolves the AlertDialog corner X to Cancel, never to the destructive Action', async () => {
		const screen = render(Harness, { openAlert: true });
		const instance = (screen as unknown as { component: ReturnType<typeof Harness> })
			.component;
		await settle();

		const content = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement;
		const corner = content.querySelector(':scope > button:last-of-type') as HTMLElement;

		corner.click();
		await settle();

		expect(instance.wasActionClicked()).toBe(false);
		expect(instance.isAlertOpen()).toBe(false);
	});

	it('positions the corner button in the top-right of the dialog', async () => {
		render(Harness, { openAlert: true });
		await settle();

		const content = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement;
		const corner = content.querySelector(':scope > button:last-of-type') as HTMLElement;

		const box = content.getBoundingClientRect();
		const btn = corner.getBoundingClientRect();

		// "Top right" measured, not assumed: close to the content's right edge, close to its
		// top edge, comfortably inside both so it never bleeds past the rounded corner.
		expect(btn.right).toBeGreaterThan(box.right - 40);
		expect(btn.right).toBeLessThanOrEqual(box.right);
		expect(btn.top).toBeLessThan(box.top + 40);
		expect(btn.top).toBeGreaterThanOrEqual(box.top);
	});
});

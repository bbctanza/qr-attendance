// The assertions in 'PageShell mobile chrome' measure computed display and geometry, so
// the real stylesheet has to be loaded. Without it every Tailwind class is inert and a
// `hidden` element reports `display: block` - which it duly did, for a while.
import '../../../routes/layout.css';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Harness from './PageShellHarness.svelte';

const settle = () => new Promise((r) => setTimeout(r, 200));

afterEach(() => {
	document.documentElement.style.width = '';
	vi.restoreAllMocks();
});

/**
 * Note on the description assertions below.
 *
 * An earlier pass asserted the opposite - that the description shows at every width -
 * because two pages hid theirs below `sm` and that inconsistency was the thing being fixed.
 * That was the wrong conclusion drawn from a real problem: consistency was achieved, but in
 * the direction that costs the most on a phone. On Access the description turned out to be
 * part of 412px of chrome standing between the sticky header and the first row of content.
 *
 * All nine descriptions restate their page's title and none carries a warning, so they are
 * now desktop-only - consistent, and consistent with the title rule directly above.
 */
describe('PageShell header', () => {
	it('renders the title in an h1 for desktop', async () => {
		render(Harness, { title: 'Access Directory' });
		await settle();

		const h1 = document.querySelector('h1');
		expect(h1?.textContent?.trim()).toBe('Access Directory');
		// The duplication fix: the title element carries the mobile-hiding class rather than
		// being rendered unconditionally, because MobileHeader already shows it on phones.
		expect(h1?.className).toContain('hidden');
		expect(h1?.className).toContain('md:block');
	});

	it('hides the description on mobile, like the title', async () => {
		render(Harness, { description: 'Everyone who can sign in.' });
		await settle();

		const p = [...document.querySelectorAll('p')].find((n) =>
			n.textContent?.includes('Everyone who can sign in')
		);
		expect(p).toBeDefined();
		expect(p?.className).toContain('hidden');
		expect(p?.className).toContain('md:block');
	});

	it('still renders the description in the DOM, not just visually', async () => {
		// Hidden by class, not omitted: it is still the page's accessible description on
		// desktop, and a class is what keeps the two widths from diverging into two trees.
		render(Harness, { description: 'Everyone who can sign in.' });
		await settle();

		const p = [...document.querySelectorAll('p')].find((n) =>
			n.textContent?.includes('Everyone who can sign in')
		);
		expect(p?.textContent).toBe('Everyone who can sign in.');
	});

	it('renders a back link only when given a destination', async () => {
		render(Harness, { backTo: null });
		await settle();
		expect(document.querySelector('a[aria-label="Back"]')).toBeNull();

		document.body.innerHTML = '';
		render(Harness, { backTo: '/settings' });
		await settle();

		const back = document.querySelector('a[aria-label="Back"]') as HTMLAnchorElement | null;
		expect(back).not.toBeNull();
		expect(back?.getAttribute('href')).toBe('/settings');
		// Desktop only: MobileHeader supplies the mobile one, and two would be wrong.
		expect(back?.className).toContain('md:inline-flex');
	});

	it('renders actions when supplied', async () => {
		render(Harness, { withActions: true });
		await settle();
		expect(document.querySelector('[data-testid="action"]')).not.toBeNull();
	});
});

describe('PageShell branches are mutually exclusive', () => {
	it('shows only the skeleton while loading', async () => {
		render(Harness, { isLoading: true });
		await settle();

		expect(document.querySelector('[data-testid="skeleton"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="content"]')).toBeNull();
	});

	it('shows only the error, and loading wins over error', async () => {
		render(Harness, { error: 'statement timeout' });
		await settle();

		expect(document.body.innerText).toContain('statement timeout');
		expect(document.querySelector('[data-testid="content"]')).toBeNull();
		expect(document.querySelector('[data-testid="skeleton"]')).toBeNull();

		document.body.innerHTML = '';
		render(Harness, { isLoading: true, error: 'statement timeout' });
		await settle();
		expect(document.querySelector('[data-testid="skeleton"]')).not.toBeNull();
		expect(document.body.innerText).not.toContain('statement timeout');
	});

	it('shows only the content when neither loading nor failed', async () => {
		render(Harness);
		await settle();

		expect(document.querySelector('[data-testid="content"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="skeleton"]')).toBeNull();
	});

	it('names the page in the error heading and fires onRetry', async () => {
		const onRetry = vi.fn();
		const screen = render(Harness, { title: 'Audit Logs', error: 'network', onRetry });
		await settle();

		expect(document.body.innerText).toContain('Audit Logs could not be loaded');
		await screen.getByRole('button', { name: 'Try again' }).click();
		await settle();
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});

describe('PageShell motion', () => {
	it('disables its entrance animation under reduced motion', async () => {
		render(Harness);
		await settle();

		const animated = document.querySelector('[data-testid="content"]')?.parentElement;
		expect(animated?.className).toContain('animate-in');
		expect(animated?.className).toContain('motion-reduce:animate-none');
	});
});

describe('PageShell mobile chrome', () => {
	const PHONE: [number, number] = [390, 760];
	const DESKTOP: [number, number] = [1280, 800];

	// The viewport really is resizable here, so `md:` breakpoints can be measured rather
	// than inferred from class strings.
	afterEach(async () => {
		await page.viewport(...DESKTOP);
	});

	/**
	 * The shell most recently rendered.
	 *
	 * Renders accumulate in the document across tests in this file, so a plain
	 * `querySelector` returns the FIRST shell - one mounted by an earlier test at desktop
	 * width. That made this block report `display: block` for an element that is correctly
	 * `none`, which cost a debugging round. Always take the last.
	 */
	function shell() {
		const roots = document.querySelectorAll('div.mx-auto');
		return roots[roots.length - 1] as HTMLElement;
	}

	const header = () => shell().firstElementChild as HTMLElement;

	/** Height of everything the shell draws above its children. */
	function chromeHeight() {
		const root = shell();
		const content = root.querySelector('[data-testid="content"]') as HTMLElement;
		return content.getBoundingClientRect().top - root.getBoundingClientRect().top;
	}

	it('costs nothing above the content on a phone when there are no actions', async () => {
		// Title and description are both desktop-only now. Two zero-height flex children
		// still earn their gaps, so the row has to be display:none, not merely empty.
		await page.viewport(...PHONE);
		render(Harness, {
			title: 'Access Directory',
			description: 'Everyone who can sign in.',
			withActions: false
		});
		await settle();

		expect(getComputedStyle(header()).display).toBe('none');
		// py-4 is 16px; anything beyond that is the collapsed header leaking space.
		expect(chromeHeight()).toBeLessThanOrEqual(16);
	});

	it('still shows the title and description on desktop', async () => {
		await page.viewport(...DESKTOP);
		render(Harness, {
			title: 'Access Directory',
			description: 'Everyone who can sign in.',
			withActions: false
		});
		await settle();

		expect(getComputedStyle(header()).display).not.toBe('none');
		const h1 = shell().querySelector('h1')!;
		expect(getComputedStyle(h1).display).not.toBe('none');
		expect(chromeHeight()).toBeGreaterThan(16);
	});

	it('keeps the row on a phone when a page does pass actions', async () => {
		await page.viewport(...PHONE);
		render(Harness, { title: 'Access Directory', withActions: true });
		await settle();

		expect(getComputedStyle(header()).display).not.toBe('none');
		// The action itself is reachable, which is the whole reason the row survives.
		expect(shell().querySelector('[data-testid="action"]')).not.toBeNull();
	});
});

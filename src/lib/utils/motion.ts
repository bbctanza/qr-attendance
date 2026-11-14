/**
 * Reduced motion, for Svelte transitions.
 *
 * Tailwind's `motion-reduce:` variant already covers the CSS transitions in this app, but it
 * cannot reach Svelte's `fade`, `fly` and `scale` — those animate inline styles from
 * JavaScript, where no media query applies.
 *
 * Zero means Svelte applies the end state on the next frame: the transition still *runs*, so
 * nothing that depends on `in:`/`out:` ordering changes behaviour, it just takes no time.
 *
 * Mirrors `kiosk-rs/src/lib/kiosk/motion.ts`, which does the same job for the native kiosk.
 */
export function dur(ms: number): number {
	if (typeof window === 'undefined' || !window.matchMedia) return ms;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}

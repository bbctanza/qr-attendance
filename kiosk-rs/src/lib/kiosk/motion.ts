/**
 * Reduced motion, for Svelte transitions.
 *
 * The hand-written CSS animations in this app each gate themselves with an
 * `@media (prefers-reduced-motion: reduce)` block — see the burn-in drift in
 * `screen-standby.svelte` and the scanner loop in `screen-ready.svelte`. Svelte's `fly`,
 * `fade` and friends have no such escape hatch: they animate inline styles from JavaScript,
 * where a media query cannot reach them.
 *
 * So durations go through here instead. Zero means Svelte applies the end state on the next
 * frame, which is an instant swap — the transition still *runs*, so nothing that depends on
 * `in:`/`out:` ordering changes behaviour, it just takes no time.
 */
export function dur(ms: number): number {
	if (typeof window === 'undefined' || !window.matchMedia) return ms;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}

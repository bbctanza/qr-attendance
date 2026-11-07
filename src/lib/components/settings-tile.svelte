<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import type { Component } from 'svelte';

	/**
	 * One row on the Options index - navigation, or an action.
	 *
	 * The index hand-rolled this twelve times, each a `button` with its own
	 * `rounded-2xl border border-border/20 bg-card/20` - a radius and border that did not
	 * match the `Card` primitive every page it links to uses. Written once here so they
	 * cannot drift again.
	 *
	 * About was the one row this didn't cover: it opens a modal rather than navigating, so
	 * it stayed a hand-rolled button and drifted back to its own classes - `rounded-2xl`
	 * instead of `rounded-xl`, `bg-card/20` instead of `bg-card`, no shadow, a bolder label
	 * weight, an unscaled chevron. `onclick` in place of `href` covers that case with the
	 * identical markup, via `svelte:element` for the one thing that has to differ: an `<a>`
	 * for navigation, so middle-click and open-in-new-tab work, or a `<button type="button">`
	 * for an action that isn't a navigation at all.
	 */
	let {
		href,
		onclick,
		label,
		description,
		icon,
		tone = 'text-primary'
	}: {
		href?: string;
		onclick?: () => void;
		label: string;
		description: string;
		icon: Component;
		/** Tailwind text colour for the icon, for rows that need to read as destructive. */
		tone?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

<svelte:element
	this={href ? 'a' : 'button'}
	{href}
	type={href ? undefined : 'button'}
	{onclick}
	role={href ? undefined : 'button'}
	class="flex w-full items-center gap-4 rounded-xl border bg-card px-4 py-3 text-left shadow-xs transition-colors duration-150 hover:bg-muted/50 active:scale-[0.99] motion-reduce:transition-none sm:px-5"
>
	<div class="shrink-0 rounded-md bg-primary/10 p-3 {tone}">
		<Icon class="h-5 w-5" />
	</div>
	<div class="min-w-0 flex-1 text-left">
		<div class="text-sm font-semibold sm:text-base">{label}</div>
		<div class="truncate text-xs text-muted-foreground sm:text-sm">{description}</div>
	</div>
	<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
</svelte:element>

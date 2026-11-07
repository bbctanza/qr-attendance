<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AlertTriangle, ChevronLeft } from '@lucide/svelte';
	import EmptyState from '$lib/components/common/empty-state.svelte';

	/**
	 * The frame every page reached from Options sits in.
	 *
	 * Written because the nine of them had drifted into nine different versions of the same
	 * furniture: four different <h1> sizes, back buttons that were an icon on one page and a
	 * labelled button on another and absent on a third, headers that vanished below `sm` on
	 * two pages, and five different ideas of what loading looks like.
	 *
	 * Two decisions worth knowing:
	 *
	 *  - The title is `hidden md:block`. On mobile it is already rendered by MobileHeader, and
	 *    that bar is sticky, so duplicating it here just pushed the content down and showed
	 *    the same words twice - which is the thing that prompted this work.
	 *
	 *  - The back control is likewise desktop-only. On mobile MobileHeader turns its hamburger
	 *    into a back arrow for any page with a parent, so the two never both appear.
	 *
	 * Padding lives here and nowhere else. `<main>` used to add its own on top of each page's,
	 * which is why phone margins were doubled.
	 */
	let {
		title,
		description = null,
		backTo = null,
		isLoading = false,
		error = null,
		onRetry = undefined,
		actions,
		skeleton,
		children
	}: {
		title: string;
		description?: string | null;
		/** Parent route. Renders a back control on desktop; omit for top-level pages. */
		backTo?: string | null;
		isLoading?: boolean;
		/** Message to show instead of content. Takes precedence over children. */
		error?: string | null;
		onRetry?: (() => void) | undefined;
		/** Buttons for the header. Visible at every width, unlike the title. */
		actions?: Snippet;
		/** Shown while loading. Should mirror the real layout, not a generic spinner. */
		skeleton?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:px-6 md:py-6 lg:px-8">
	<!--
		With the title and the description both desktop-only, a page that passes no actions has
		nothing visible in this row on a phone - but two zero-height flex children still earn
		their `gap-3`, and the row itself still earns the container's `gap-6`. That is ~36px of
		blank space above the content, which is the very thing being removed. `display: none`
		makes it cost nothing, and flex gaps are not drawn for hidden items.
	-->
	<div
		class="{actions ? 'flex' : 'hidden md:flex'} flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
	>
		<div class="flex min-w-0 items-start gap-2">
			{#if backTo}
				<a
					href={backTo}
					aria-label="Back"
					class="mt-0.5 hidden shrink-0 rounded-lg p-2 transition-colors duration-150 hover:bg-muted motion-reduce:transition-none md:inline-flex"
				>
					<ChevronLeft class="h-5 w-5" />
				</a>
			{/if}
			<div class="min-w-0">
				<!-- Mobile gets this from MobileHeader; rendering it here too is the duplication. -->
				<h1 class="hidden text-2xl font-bold tracking-tight md:block md:text-3xl">{title}</h1>
				{#if description}
					<!--
						Desktop-only, for the same reason as the title above it. On a phone the
						sticky MobileHeader already names the page, and the description is then the
						only thing between that bar and the content - a sentence you read once,
						permanently occupying the top of a screen you scroll every day. On Access
						it was part of 412px of chrome standing before the first person.
						All nine of these descriptions restate their title; none carries a warning.
					-->
					<p class="hidden text-sm text-muted-foreground md:mt-1 md:block">{description}</p>
				{/if}
			</div>
		</div>

		{#if actions}
			<div class="flex shrink-0 flex-wrap items-center gap-2">
				{@render actions()}
			</div>
		{/if}
	</div>

	{#if isLoading}
		<!--
			flex flex-col gap-6 - the same gap the loaded branch below uses between its children.
			This wrapper used to be a plain block with no gap at all, so a skeleton with more
			than one top-level piece (a toolbar block above a list block, say) stacked them
			flush against each other instead of spaced like the real content they stand in for.
		-->
		<div class="flex animate-in flex-col gap-6 duration-150 fade-in motion-reduce:animate-none">
			{@render skeleton?.()}
		</div>
	{:else if error}
		<EmptyState
			icon={AlertTriangle}
			tone="error"
			title="{title} could not be loaded"
			description={error}
			{onRetry}
		/>
	{:else}
		<div
			class="flex animate-in flex-col gap-6 duration-150 fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
		>
			{@render children()}
		</div>
	{/if}
</div>

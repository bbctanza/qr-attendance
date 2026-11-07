<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Component } from 'svelte';

	/**
	 * The "nothing here" and "that failed" panel.
	 *
	 * One component for both because the distinction is what matters and the old pages lost
	 * it: every Supabase call discarded its `error`, so a failed query rendered the same
	 * "No Live Session" card as a genuinely idle Sunday. `tone="error"` is what makes a
	 * failure look like one, and `onRetry` is what makes it recoverable.
	 */
	let {
		icon,
		title,
		description = null,
		tone = 'empty',
		actionLabel = null,
		onAction = undefined,
		onRetry = undefined,
		compact = false
	}: {
		icon: Component;
		title: string;
		description?: string | null;
		tone?: 'empty' | 'error';
		actionLabel?: string | null;
		onAction?: (() => void) | undefined;
		onRetry?: (() => void) | undefined;
		compact?: boolean;
	} = $props();

	const Icon = $derived(icon);
</script>

<div
	class="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center {tone ===
	'error'
		? 'border-destructive/30 bg-destructive/5'
		: 'border-border/60 bg-muted/20'} {compact ? 'p-6' : 'p-8 sm:p-12'}"
>
	<Icon
		class="{compact ? 'h-8 w-8' : 'h-10 w-10'} {tone === 'error'
			? 'text-destructive/50'
			: 'text-muted-foreground/30'}"
	/>
	<div class="space-y-1">
		<p class="font-bold {tone === 'error' ? 'text-destructive' : ''}">{title}</p>
		{#if description}
			<p class="mx-auto max-w-md text-xs text-muted-foreground sm:text-sm">{description}</p>
		{/if}
	</div>
	{#if onRetry}
		<Button variant="outline" size="sm" class="mt-1" onclick={onRetry}>Try again</Button>
	{:else if actionLabel && onAction}
		<Button variant="outline" size="sm" class="mt-1" onclick={onAction}>{actionLabel}</Button>
	{/if}
</div>

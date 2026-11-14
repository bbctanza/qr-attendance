<script lang="ts">
	import { PinInput as PinInputPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	/**
	 * One box per character, rather than a text field with an XXXX-XXXX placeholder.
	 *
	 * A placeholder only describes the shape; boxes *are* the shape. You can see how many
	 * characters are wanted, how many you have typed and where the caret is without reading
	 * anything — which matters for a code someone is reading aloud from another screen, and
	 * for a PIN typed on a door device.
	 *
	 * Built on the bits-ui primitive, so paste, arrow keys, backspace across cells and mobile
	 * one-time-code autofill all behave as people expect.
	 */
	let {
		ref = $bindable(null),
		value = $bindable(''),
		maxlength,
		mask = false,
		autofocus = false,
		oncomplete = undefined,
		class: className,
		inputmode = 'text',
		...restProps
	}: {
		ref?: HTMLInputElement | null;
		value?: string;
		maxlength: number;
		/** Show dots instead of characters. For a PIN on a screen people stand in front of. */
		mask?: boolean;
		/**
		 * Focus on mount. Only for a field that is the sole reason its dialog or screen is
		 * open - autofocusing one input among several just moves the guessing around.
		 */
		autofocus?: boolean;
		/** Fired once every cell is filled, so Enter is not needed to move on. */
		oncomplete?: (value: string) => void;
		class?: string;
		inputmode?: 'text' | 'numeric';
		children?: Snippet;
		[key: string]: unknown;
	} = $props();

	$effect(() => {
		if (!autofocus || !ref) return;
		// A tick behind the dialog's own focus handling, which focuses its content on open and
		// would otherwise pull focus straight back off this input.
		const id = setTimeout(() => ref?.focus(), 50);
		return () => clearTimeout(id);
	});

	let fired = '';
	$effect(() => {
		if (!oncomplete) return;
		if (value.length === maxlength && value !== fired) {
			fired = value;
			oncomplete(value);
		} else if (value.length < maxlength) {
			// Re-arm, so correcting a digit and refilling fires again.
			fired = '';
		}
	});
</script>

<PinInputPrimitive.Root
	bind:inputRef={ref}
	bind:value
	{maxlength}
	{inputmode}
	class={cn('group/pininput flex w-full items-center justify-center gap-2', className)}
	{...restProps}
>
	{#snippet children({ cells })}
		{#each cells as cell, i (i)}
			<PinInputPrimitive.Cell
				{cell}
				class={cn(
					// Cells share the width rather than claiming a fixed one: six boxes at a fixed
					// 44px overflow a narrow dialog, and eight certainly do. `min-w-0` lets them
					// shrink, `max-w-14` stops them stretching into slabs in a wide container.
					'relative flex h-14 min-w-0 max-w-14 flex-1 items-center justify-center',
					'rounded-lg border text-xl font-semibold tabular-nums transition-all',
					'border-input bg-background',
					cell.isActive && 'z-10 border-ring ring-[3px] ring-ring/50'
				)}
			>
				{#if cell.char !== null && cell.char !== undefined}
					{mask ? '•' : cell.char}
				{/if}
				{#if cell.hasFakeCaret}
					<!-- The real input is a single offscreen field, so the caret has to be drawn. -->
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
						<div class="h-7 w-px animate-caret-blink bg-foreground duration-1000"></div>
					</div>
				{/if}
			</PinInputPrimitive.Cell>
		{/each}
	{/snippet}
</PinInputPrimitive.Root>

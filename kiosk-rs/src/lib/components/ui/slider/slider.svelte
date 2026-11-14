<script lang="ts">
	import { Slider as SliderPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	/**
	 * The one shadcn component the web app does not have — it has never needed a slider.
	 * Authored to the official shadcn-svelte slider rather than hand-rolled, so it belongs to
	 * the same system as everything copied from the web app rather than being a local invention.
	 */
	let {
		ref = $bindable(null),
		value = $bindable(),
		orientation = 'horizontal',
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SliderPrimitive.RootProps> = $props();
</script>

<SliderPrimitive.Root
	bind:ref
	bind:value={value as never}
	{orientation}
	data-slot="slider"
	class={cn(
		"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation='vertical']:h-full data-[orientation='vertical']:min-h-44 data-[orientation='vertical']:w-auto data-[orientation='vertical']:flex-col",
		className
	)}
	{...restProps}
>
	{#snippet children({ thumbItems })}
		<span
			data-orientation={orientation}
			data-slot="slider-track"
			class={cn(
				"relative grow overflow-hidden rounded-full bg-muted data-[orientation='horizontal']:h-2 data-[orientation='horizontal']:w-full data-[orientation='vertical']:h-full data-[orientation='vertical']:w-2"
			)}
		>
			<SliderPrimitive.Range
				data-slot="slider-range"
				class={cn(
					"absolute bg-primary data-[orientation='horizontal']:h-full data-[orientation='vertical']:w-full"
				)}
			/>
		</span>
		{#each thumbItems as { index } (index)}
			<SliderPrimitive.Thumb
				{index}
				data-slot="slider-thumb"
				class="block size-6 shrink-0 rounded-full border border-primary bg-background shadow-sm
					ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4
					focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>

<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';

	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = 'short',
		...restProps
	}: any = $props();
</script>

<CalendarPrimitive.Root
	bind:value
	bind:placeholder
	bind:ref
	{weekdayFormat}
	class={cn('p-3', className)}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<CalendarPrimitive.Header class="relative flex w-full items-center justify-between pt-1">
			<CalendarPrimitive.PrevButton
				class={cn(
					'flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-sm font-medium opacity-50 shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground hover:opacity-100'
				)}
			>
				<ChevronLeft class="h-4 w-4" />
			</CalendarPrimitive.PrevButton>
			<CalendarPrimitive.Heading class="text-sm font-medium" />
			<CalendarPrimitive.NextButton
				class={cn(
					'flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-sm font-medium opacity-50 shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground hover:opacity-100'
				)}
			>
				<ChevronRight class="h-4 w-4" />
			</CalendarPrimitive.NextButton>
		</CalendarPrimitive.Header>
		<CalendarPrimitive.Grid class="mt-4 w-full border-collapse space-y-1">
			<CalendarPrimitive.GridHead>
				<CalendarPrimitive.GridRow class="flex">
					{#each weekdays as day}
						<CalendarPrimitive.HeadCell
							class="w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground"
						>
							{day}
						</CalendarPrimitive.HeadCell>
					{/each}
				</CalendarPrimitive.GridRow>
			</CalendarPrimitive.GridHead>
			<CalendarPrimitive.GridBody>
				{#each months as month}
					{#each month.weeks as week}
						<CalendarPrimitive.GridRow class="mt-2 flex w-full">
							{#each week as day}
								<CalendarPrimitive.Cell
									date={day}
									month={month.value}
									class="relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20 data-outside-month:text-muted-foreground data-outside-month:opacity-50 [&:has([data-selected])]:rounded-md [&:has([data-selected])]:bg-accent"
								>
									<CalendarPrimitive.Day
										class={cn(
											'h-9 w-9 rounded-md p-0 font-normal hover:bg-accent hover:text-accent-foreground aria-selected:opacity-100 data-selected:bg-primary data-selected:text-primary-foreground data-selected:hover:bg-primary data-selected:hover:text-primary-foreground data-today:bg-accent data-today:text-accent-foreground',
											// Handle outside dates opacity
											'data-outside-month:text-muted-foreground data-outside-month:opacity-50'
										)}
									>
										{day.day}
									</CalendarPrimitive.Day>
								</CalendarPrimitive.Cell>
							{/each}
						</CalendarPrimitive.GridRow>
					{/each}
				{/each}
			</CalendarPrimitive.GridBody>
		</CalendarPrimitive.Grid>
	{/snippet}
</CalendarPrimitive.Root>

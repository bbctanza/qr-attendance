<script lang="ts">
	import { Calendar as CalendarPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
    import { ChevronLeft, ChevronRight } from "lucide-svelte";

	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = "short",
		...restProps
	}: any = $props();
</script>

<CalendarPrimitive.Root
    bind:value
    bind:placeholder
    bind:ref
	{weekdayFormat}
	class={cn("p-3", className)}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<CalendarPrimitive.Header class="pt-1 relative flex items-center justify-between w-full">
			<CalendarPrimitive.PrevButton
				class={cn(
					"border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-7 w-7 items-center justify-center rounded-md border text-sm font-medium shadow-sm transition-colors opacity-50 hover:opacity-100"
				)}
			>
                <ChevronLeft class="h-4 w-4" />
			</CalendarPrimitive.PrevButton>
			<CalendarPrimitive.Heading class="text-sm font-medium" />
			<CalendarPrimitive.NextButton
				class={cn(
					"border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-7 w-7 items-center justify-center rounded-md border text-sm font-medium shadow-sm transition-colors opacity-50 hover:opacity-100"
				)}
			>
                <ChevronRight class="h-4 w-4" />
			</CalendarPrimitive.NextButton>
		</CalendarPrimitive.Header>
		<CalendarPrimitive.Grid class="w-full border-collapse space-y-1 mt-4">
			<CalendarPrimitive.GridHead>
				<CalendarPrimitive.GridRow class="flex">
					{#each weekdays as day}
						<CalendarPrimitive.HeadCell
							class="text-muted-foreground w-9 rounded-md text-[0.8rem] font-normal"
						>
							{day}
						</CalendarPrimitive.HeadCell>
					{/each}
				</CalendarPrimitive.GridRow>
			</CalendarPrimitive.GridHead>
			<CalendarPrimitive.GridBody>
				{#each months as month}
					{#each month.weeks as week}
						<CalendarPrimitive.GridRow class="flex w-full mt-2">
							{#each week as day}
								<CalendarPrimitive.Cell
									date={day}
									month={month.value}
									class="relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20 data-outside-month:text-muted-foreground data-outside-month:opacity-50 [&:has([data-selected])]:bg-accent [&:has([data-selected])]:rounded-md"
								>
									<CalendarPrimitive.Day
										class={cn(
											"h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent hover:text-accent-foreground data-selected:bg-primary data-selected:text-primary-foreground data-selected:hover:bg-primary data-selected:hover:text-primary-foreground data-today:bg-accent data-today:text-accent-foreground",
                                            // Handle outside dates opacity
                                            "data-outside-month:text-muted-foreground data-outside-month:opacity-50"
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

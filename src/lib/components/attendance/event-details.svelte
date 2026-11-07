<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import {
		Drawer,
		DrawerContent,
		DrawerHeader,
		DrawerTitle,
		DrawerTrigger
	} from '$lib/components/ui/drawer';
	import { Calendar, ChevronRight, Clock, FileText, MapPin, X } from '@lucide/svelte';

	/**
	 * Name / date / time / place for the live event.
	 *
	 * A drawer on phones and a popover on desktop, because a popover anchored to a button is
	 * unusable at 400px and a bottom sheet is odd on a wide screen. The four fields are
	 * written once as a snippet and rendered into both shells - previously each shell carried
	 * its own copy of the markup, in two different branches of the page, so a change to a
	 * label had to be made twice.
	 */
	let {
		name,
		date,
		time,
		place
	}: {
		name: string;
		date: string;
		time: string;
		place: string;
	} = $props();

	let drawerOpen = $state(false);

	const fields = $derived([
		{ icon: FileText, label: 'Event Name', value: name, emphasis: true },
		{ icon: Calendar, label: 'Date', value: date, emphasis: false },
		{ icon: Clock, label: 'Time', value: time, emphasis: false },
		{ icon: MapPin, label: 'Place', value: place, emphasis: false }
	]);
</script>

{#snippet detailFields()}
	<div class="space-y-4">
		{#each fields as field (field.label)}
			{@const Icon = field.icon}
			<div>
				<h4
					class="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase"
				>
					<Icon class="h-4 w-4" />
					{field.label}
				</h4>
				<p class="mt-1 {field.emphasis ? 'text-lg font-bold' : 'text-base'}">{field.value}</p>
			</div>
		{/each}
	</div>
{/snippet}

<!-- Mobile: bottom sheet -->
<div class="md:hidden">
	<Drawer bind:open={drawerOpen}>
		<DrawerTrigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm" class="gap-1.5">
					Details
					<ChevronRight class="h-3 w-3" />
				</Button>
			{/snippet}
		</DrawerTrigger>
		<DrawerContent>
			<DrawerHeader class="flex flex-row items-center justify-between">
				<DrawerTitle>Event Details</DrawerTitle>
				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					aria-label="Close details"
					onclick={() => (drawerOpen = false)}
				>
					<X class="h-4 w-4" />
				</Button>
			</DrawerHeader>
			<div class="px-4 pb-6">
				{@render detailFields()}
			</div>
		</DrawerContent>
	</Drawer>
</div>

<!-- Desktop: anchored popover -->
<div class="hidden md:block">
	<Popover>
		<PopoverTrigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm" class="gap-1.5">
					Details
					<ChevronRight class="h-3 w-3" />
				</Button>
			{/snippet}
		</PopoverTrigger>
		<PopoverContent class="w-80">
			{@render detailFields()}
		</PopoverContent>
	</Popover>
</div>

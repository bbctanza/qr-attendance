<script lang="ts">
	import { MapPin } from '@lucide/svelte';
	import EventDetails from './event-details.svelte';

	/**
	 * Header for an in-progress event.
	 *
	 * The "LIVE" dot is only honest now that the page actually subscribes to scans; it used
	 * to pulse over numbers frozen at page load.
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
</script>

<div class="rounded-2xl border border-border/40 bg-card p-4 shadow-sm sm:p-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0 space-y-1">
			<div
				class="flex items-center gap-2 text-[10px] font-black tracking-widest text-primary uppercase"
			>
				<span class="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
				Live Session
			</div>
			<h3 class="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{name}</h3>
			<div class="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
				<MapPin class="h-4 w-4 shrink-0" />
				<span class="truncate">{place}</span>
			</div>
		</div>

		<div class="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
			<div class="sm:text-right">
				<div class="text-xs tracking-widest text-muted-foreground uppercase sm:order-2">Time</div>
				<div class="text-sm font-bold sm:order-1">{time}</div>
			</div>
			<EventDetails {name} {date} {time} {place} />
		</div>
	</div>
</div>

<script lang="ts">
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import type { Snippet } from 'svelte';

	/**
	 * One person in a list: initials, name, group, and whatever the caller puts on the right.
	 *
	 * Shared by the live scan list and both history rosters, which were three separate copies
	 * of the same row.
	 *
	 * Initials only, no image. Members have no photos in practice, so an <AvatarImage> here
	 * would be a permanently empty element - and the two attendance pages used to fill it by
	 * requesting api.dicebear.com with the member's name in the query string, which sent names
	 * to a third party and broke with no network. The circle is kept because it anchors each
	 * row and makes a long roster scannable; the picture is what was never coming.
	 */
	let {
		firstName,
		lastName,
		careGroup = null,
		trailing
	}: {
		firstName: string;
		lastName: string;
		careGroup?: string | null;
		trailing?: Snippet;
	} = $props();

	let initials = $derived(`${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?');
</script>

<div
	class="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
>
	<div class="flex min-w-0 items-center gap-3">
		<Avatar class="h-9 w-9 shrink-0 border border-border/50">
			<AvatarFallback class="text-xs font-semibold">{initials}</AvatarFallback>
		</Avatar>
		<div class="min-w-0">
			<div class="truncate text-sm font-semibold">{firstName} {lastName}</div>
			{#if careGroup && careGroup !== '-'}
				<div class="truncate text-[11px] text-muted-foreground">{careGroup}</div>
			{/if}
		</div>
	</div>
	{#if trailing}
		<div class="shrink-0">{@render trailing()}</div>
	{/if}
</div>

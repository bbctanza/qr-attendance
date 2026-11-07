<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card';
	let { autoRowsMax = false } = $props();

	// Deliberately uneven content: this is what exposes a grid that does not stretch.
	const items = [
		{ title: 'Short', body: 'One line.' },
		{
			title: 'Much longer card',
			body: 'Several lines of body copy that wrap and make this card considerably taller than its neighbour so any height difference is obvious.'
		},
		{ title: 'Medium', body: 'Two lines of copy here.' }
	];
</script>

<div
	style="width:900px"
	class={autoRowsMax ? 'grid auto-rows-max grid-cols-3 gap-6' : 'grid grid-cols-3 gap-6'}
	data-testid="grid"
>
	{#each items as item (item.title)}
		<Card data-testid="card">
			<CardContent>
				<h3 class="font-semibold">{item.title}</h3>
				<p class="text-sm text-muted-foreground">{item.body}</p>
			</CardContent>
		</Card>
	{/each}
</div>

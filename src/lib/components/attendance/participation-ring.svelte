<script lang="ts">
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { ArcChart, Text } from 'layerchart';

	/**
	 * Participation as a ring.
	 *
	 * Takes the raw counts rather than a precomputed percentage so there is exactly one
	 * place that divides - the mobile and desktop copies of this chart each used to do their
	 * own arithmetic and their own zero-guard.
	 */
	let {
		present,
		expected,
		size = 'md'
	}: {
		present: number;
		expected: number;
		size?: 'sm' | 'md';
	} = $props();

	let rate = $derived(expected > 0 ? Math.round((present / expected) * 100) : 0);
	let series = $derived([
		{
			key: 'participation',
			color: 'var(--color-primary)',
			data: [{ label: 'participation', value: rate }]
		}
	]);

	const chartConfig = {
		participation: { label: 'Participation', color: 'var(--color-primary)' }
	} satisfies Chart.ChartConfig;

	let dims = $derived(
		size === 'sm'
			? {
					outer: 52,
					inner: 40,
					trackOuter: 50,
					trackInner: 42,
					padding: 15,
					hole: 42,
					text: 'text-2xl!'
				}
			: {
					outer: 72,
					inner: 55,
					trackOuter: 70,
					trackInner: 58,
					padding: 20,
					hole: 55,
					text: 'text-3xl!'
				}
	);
</script>

<Chart.Container config={chartConfig} class="aspect-square">
	<ArcChart
		label="label"
		value="value"
		outerRadius={dims.outer}
		innerRadius={dims.inner}
		trackOuterRadius={dims.trackOuter}
		trackInnerRadius={dims.trackInner}
		padding={dims.padding}
		range={[0, 360]}
		maxValue={100}
		{series}
		props={{ arc: { track: { fill: 'var(--muted)' }, motion: 'tween' } }}
	>
		{#snippet belowMarks()}
			<circle cx="0" cy="0" r={dims.hole} class="fill-background" />
		{/snippet}
		{#snippet aboveMarks()}
			<Text
				value={`${rate}%`}
				textAnchor="middle"
				verticalAnchor="middle"
				class="fill-foreground {dims.text} font-bold"
				dy={size === 'sm' ? 2 : 3}
			/>
		{/snippet}
	</ArcChart>
</Chart.Container>

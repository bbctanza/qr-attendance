<script lang="ts">
	import FilterChips from '$lib/components/common/filter-chips.svelte';

	/**
	 * Mirrors the container FilterChips actually lives in: PageShell's `px-4` wrapper.
	 *
	 * This matters because the chip row bleeds with `-mx-4` so it can scroll to the screen
	 * edge. Rendered bare, that bleed has nothing to cancel it and widens the page by 32px -
	 * which is a real constraint on where the component may be used, not a quirk of the test.
	 */
	let { options, value = $bindable('all'), padded = true } = $props();
</script>

<div class={padded ? 'px-4' : ''} data-testid="container">
	<FilterChips {options} bind:value label="Filter people" />
</div>

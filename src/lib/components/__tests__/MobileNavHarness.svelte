<script lang="ts">
	/**
	 * The bottom nav's geometry, reproduced for measurement.
	 *
	 * The real `mobile-nav.svelte` needs `$page` and `goto`, which have no router in a
	 * component test, so the class strings are copied here verbatim instead - minus
	 * `md:hidden`, since the test viewport is desktop-width and `fixed` has to resolve
	 * against the real viewport for the measurement to mean anything. Nothing about the
	 * nav's height or the FAB's rise is responsive, so the geometry is the same.
	 *
	 * `mobile-nav-classes.test.ts` asserts these strings still match the component.
	 */
	let { footer = true } = $props();
</script>

<main class="flex flex-1 flex-col pb-32" data-testid="main">
	<div style="height: 1800px"></div>
	{#if footer}
		<div class="flex flex-col items-center gap-3 border-t px-4 py-3" data-testid="footer">
			<span class="text-xs">1–10 of 14 rows</span>
			<div class="flex items-center gap-2">
				<button class="h-8 px-3 text-xs" data-testid="prev">Previous</button>
				<button class="h-8 px-3 text-xs" data-testid="next">Next</button>
			</div>
		</div>
	{/if}
</main>

<nav
	data-mobile-nav="true"
	data-testid="nav"
	class="fixed right-0 bottom-0 left-0 z-50 border-t border-border/10 bg-background/80 px-4 pt-2 pb-6 backdrop-blur-xl"
>
	<div class="mx-auto flex max-w-lg items-center justify-between">
		<button class="flex w-16 flex-col items-center gap-1 transition-colors">
			<div class="h-6 w-6" aria-hidden="true"></div>
			<span class="text-[10px] font-medium">Home</span>
		</button>
		<button class="flex w-16 flex-col items-center gap-1 transition-colors">
			<div class="h-6 w-6" aria-hidden="true"></div>
			<span class="text-[10px] font-medium">Members</span>
		</button>
		<button
			data-testid="fab"
			aria-label="Scan"
			class="relative -top-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 shadow-primary/20 ring-background transition-all outline-none active:scale-95"
		>
			<div class="h-7 w-7" aria-hidden="true"></div>
		</button>
		<button class="flex w-16 flex-col items-center gap-1 transition-colors">
			<div class="h-6 w-6" aria-hidden="true"></div>
			<span class="text-[10px] font-medium">Attendance</span>
		</button>
		<button class="flex w-16 flex-col items-center gap-1 transition-colors">
			<div class="h-6 w-6" aria-hidden="true"></div>
			<span class="text-[10px] font-medium">Options</span>
		</button>
	</div>
</nav>

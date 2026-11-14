<script lang="ts">
	/**
	 * Inter at exactly the weights the web app loads (400/500/600/700 — see src/app.html).
	 *
	 * Matching the weight SET matters, not just the family. The web app serves static
	 * instances capped at 700, so its `font-extrabold`/`font-black` classes render at 700.
	 * The kiosk previously used the variable font, which really does have 800 and 900 — so
	 * the ported countdown digits came out visibly heavier than the same screen in the main
	 * system. Same four weights, same rendering.
	 *
	 * Bundled rather than pulled from Google Fonts on purpose: this device is built to keep
	 * working when the network drops, and a web font fetched at boot would fall back to
	 * system sans in exactly that situation.
	 */
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/inter/700.css';
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}

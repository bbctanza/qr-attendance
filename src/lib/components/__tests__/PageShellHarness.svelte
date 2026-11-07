<script lang="ts">
	import PageShell from '$lib/components/page-shell.svelte';
	let {
		title = 'Access Directory',
		description = null,
		backTo = null,
		isLoading = false,
		error = null,
		onRetry = undefined,
		withActions = false
	} = $props();
</script>

{#snippet actionButtons()}
	<button data-testid="action">Invite</button>
{/snippet}

<!--
	`actions` is passed or omitted, never passed-but-empty. PageShell branches on whether the
	snippet exists, so a snippet that happens to render nothing is a different case entirely -
	and it was the case the first version of this harness accidentally tested.
-->
<PageShell
	{title}
	{description}
	{backTo}
	{isLoading}
	{error}
	{onRetry}
	actions={withActions ? actionButtons : undefined}
>
	{#snippet skeleton()}
		<div data-testid="skeleton">loading shape</div>
	{/snippet}
	<div data-testid="content">real content</div>
</PageShell>

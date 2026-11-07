<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	/**
	 * Only one of the two opens at a time by default - two real overlays stacked at once
	 * means the later one's `fixed inset-0` backdrop intercepts every click meant for the
	 * first, which is a real stacking fact, not a test artifact. Each test opens the one it
	 * is actually exercising.
	 */
	// $state(props) only captures the prop's value at mount, which is exactly what is wanted
	// here - a test passes the initial open state once and then drives it through the
	// component's own bindable `open`, same as a real caller would.
	let { openDialog = false, openAlert = false }: { openDialog?: boolean; openAlert?: boolean } =
		$props();

	let dialogOpen = $state(untrack(() => openDialog));
	let alertOpen = $state(untrack(() => openAlert));
	let actionClicked = $state(false);

	export function isDialogOpen() {
		return dialogOpen;
	}
	export function isAlertOpen() {
		return alertOpen;
	}
	export function wasActionClicked() {
		return actionClicked;
	}
</script>

<!-- A plain Dialog whose only other exit is a footer Cancel, same shape as every real one. -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content
		class="fixed top-[50%] left-[50%] z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6"
	>
		<Dialog.Header>
			<Dialog.Title>A dialog</Dialog.Title>
		</Dialog.Header>
		<Dialog.Footer>
			<button onclick={() => (dialogOpen = false)}>Cancel</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- An AlertDialog with both Cancel and a destructive Action, same shape as the access page's
     confirmations. The X must resolve to Cancel, never to Action. -->
<AlertDialog.Root bind:open={alertOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Suspend this account?</AlertDialog.Title>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={() => (actionClicked = true)}>Suspend</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

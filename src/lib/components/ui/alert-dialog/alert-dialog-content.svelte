<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '$lib/utils.js';
	import { X } from '@lucide/svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
	} = $props();
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<!--
		Escape closes, on every modal in the app. Set explicitly rather than left to a library
		default, and because this component is now used for forms as well as confirmations —
		where being unable to back out with the key everyone reaches for is just a trap. On a
		destructive confirm, Escape still resolves to Cancel, which is the safe direction.
		A caller can override it: restProps spreads after this.
	-->
	<AlertDialogPrimitive.Content
		bind:ref
		escapeKeydownBehavior="close"
		data-slot="alert-dialog-content"
		class={cn(
			// inset-x-4, not a max-w-based margin: every page on this component passes its own
			// max-w-md/max-w-lg, and tailwind-merge drops whichever max-w-* comes first when two
			// collide - so a page's override was silently deleting the only thing keeping the
			// dialog off the screen edges. inset-x-4 is a different property, so it survives any
			// max-w-* a page passes; mx-auto then centers the page's capped width inside it.
			'fixed top-[50%] inset-x-4 z-50 mx-auto grid max-w-lg -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		<!--
			The corner X, same as Dialog gets. An AlertDialog always already has a Cancel button
			in its footer - that is what distinguishes it from a plain Dialog - but the corner X
			is reached for by habit before the footer is read, and every confirmation dialog in
			the app lacked one.

			Wired to AlertDialogPrimitive.Cancel, not a bare Close: bits-ui's AlertDialog has no
			neutral "close" action by design, only Action (confirm) and Cancel (back out), since
			an alert dialog exists to force an explicit choice. The X has to resolve to the
			non-destructive one of those two, same as clicking the existing Cancel button does.
		-->
		<AlertDialogPrimitive.Cancel
			class="absolute top-4 right-4 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity outline-none hover:bg-muted hover:opacity-100 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
		>
			<X class="h-4 w-4" />
			<span class="sr-only">Cancel</span>
		</AlertDialogPrimitive.Cancel>
	</AlertDialogPrimitive.Content>
</AlertDialogPortal>

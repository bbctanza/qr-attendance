<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ShieldCheck, Eye, EyeOff, Loader2, AlertCircle } from '@lucide/svelte';
	import { accessApi } from '$lib/api/access';
	import { elevationPromptOpen, elevationReason, settleElevationPrompt } from '$lib/stores/elevation';

	/**
	 * The one place a password is asked for while confirming something sensitive - access
	 * changes, leaving kiosk mode, and whatever else calls ensureElevated() next.
	 *
	 * Confirming here mints a ten-minute elevation, so an admin working through a batch of
	 * changes types their password once rather than once per change.
	 *
	 * Built as a plain overlay rather than on the AlertDialog primitive, because it has to
	 * be able to appear *above* one: "Suspend access?" is open, the admin confirms, and
	 * elevation turns out to have lapsed. Two stacked bits-ui modals fight over the focus
	 * trap, and the underlying one sets pointer-events:none on <body>, which is why this
	 * overlay re-enables them explicitly. Escape and the backdrop both cancel.
	 *
	 * No CAPTCHA here (removed - it was shipping with Cloudflare's published TEST site key,
	 * which has no verification value and shows its own "For testing only" banner). If the
	 * Supabase project has CAPTCHA enforcement turned on for password grants, this form will
	 * start failing server-side rather than silently - that setting, not this component, is
	 * where that trade-off actually gets made.
	 */

	let password = $state('');
	let showPassword = $state(false);
	let isSubmitting = $state(false);
	let errorMessage = $state('');
	let passwordInput = $state<HTMLInputElement | null>(null);

	// Focus the field whenever the prompt opens, so confirming is pure typing.
	$effect(() => {
		if ($elevationPromptOpen && passwordInput) passwordInput.focus();
	});

	function reset() {
		password = '';
		showPassword = false;
		errorMessage = '';
		isSubmitting = false;
	}

	async function confirm() {
		if (!password || isSubmitting) return;
		isSubmitting = true;
		errorMessage = '';

		try {
			await accessApi.verifyIdentity(password);
			reset();
			settleElevationPrompt(true);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Could not confirm your identity.';
			password = '';
			passwordInput?.focus();
		} finally {
			isSubmitting = false;
		}
	}

	function cancel() {
		if (isSubmitting) return;
		reset();
		// Settles the promise the caller is awaiting; without this, cancelling would leave
		// the action that asked for elevation hanging forever.
		settleElevationPrompt(false);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && $elevationPromptOpen) {
			event.stopPropagation();
			cancel();
		}
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if $elevationPromptOpen}
	<!-- Above bits-ui's z-50 so it layers over whichever confirmation triggered it, and above
	     the kiosk standby screen's z-[200] (/scan) - this is meant to be the topmost thing on
	     screen no matter what asked for it, not just topmost among ordinary dialogs. It was
	     z-[60] until the kiosk's "Exit kiosk" button opened this from behind an opaque
	     full-screen overlay: the prompt was firing correctly, just invisible and unreachable. -->
	<div
		class="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) cancel();
		}}
	>
		<div
			class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="elevation-title"
			aria-describedby="elevation-description"
		>
			<div class="flex items-start gap-3">
				<div class="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
					<ShieldCheck class="h-5 w-5" />
				</div>
				<div class="space-y-1">
					<h2 id="elevation-title" class="text-base font-bold">{$elevationReason.title}</h2>
					<p id="elevation-description" class="text-xs leading-relaxed text-muted-foreground">
						{$elevationReason.description}
					</p>
				</div>
			</div>

			<form
				class="mt-5 space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					confirm();
				}}
			>
				{#if errorMessage}
					<div
						class="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
						role="alert"
					>
						<AlertCircle class="mt-px h-3.5 w-3.5 shrink-0" />
						<span>{errorMessage}</span>
					</div>
				{/if}

				<div class="space-y-1.5">
					<Label for="elevation-password" class="text-xs font-medium">Your password</Label>
					<div class="relative">
						<Input
							id="elevation-password"
							bind:ref={passwordInput}
							type={showPassword ? 'text' : 'password'}
							autocomplete="current-password"
							placeholder="Enter your password"
							bind:value={password}
							disabled={isSubmitting}
							class="pr-10"
						/>
						<button
							type="button"
							class="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
							onclick={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<div class="flex justify-end gap-2 pt-1">
					<Button type="button" variant="outline" onclick={cancel} disabled={isSubmitting}>
						Cancel
					</Button>
					<Button type="submit" disabled={!password || isSubmitting}>
						{#if isSubmitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Confirming...
						{:else}
							Confirm
						{/if}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}

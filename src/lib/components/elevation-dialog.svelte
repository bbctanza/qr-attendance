<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ShieldCheck, Eye, EyeOff, Loader2, AlertCircle } from '@lucide/svelte';
	import { Turnstile } from 'svelte-turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { accessApi } from '$lib/api/access';
	import { elevationPromptOpen, settleElevationPrompt } from '$lib/stores/elevation';

	/**
	 * The one place a password is asked for while managing access.
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
	 * The CAPTCHA is opportunistic - attached when the widget resolves, omitted when it
	 * does not. Supabase only requires one if the project enforces CAPTCHA on password
	 * grants, and a widget that fails to load must not block administering the system.
	 */

	let password = $state('');
	let showPassword = $state(false);
	let isSubmitting = $state(false);
	let errorMessage = $state('');
	let captchaToken = $state<string | undefined>(undefined);
	let resetCaptcha = $state<(() => void) | undefined>(undefined);
	let passwordInput = $state<HTMLInputElement | null>(null);

	const captchaEnabled = !!PUBLIC_TURNSTILE_SITE_KEY;

	// Focus the field whenever the prompt opens, so confirming is pure typing.
	$effect(() => {
		if ($elevationPromptOpen && passwordInput) passwordInput.focus();
	});

	function reset() {
		password = '';
		showPassword = false;
		errorMessage = '';
		isSubmitting = false;
		captchaToken = undefined;
		resetCaptcha?.();
	}

	async function confirm() {
		if (!password || isSubmitting) return;
		isSubmitting = true;
		errorMessage = '';

		try {
			await accessApi.verifyIdentity(password, captchaToken);
			reset();
			settleElevationPrompt(true);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Could not confirm your identity.';
			password = '';
			// Turnstile tokens are single-use; retrying with a spent one fails for the wrong reason.
			captchaToken = undefined;
			resetCaptcha?.();
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
	<!-- Above bits-ui's z-50 so it layers over whichever confirmation triggered it. -->
	<div
		class="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
					<h2 id="elevation-title" class="text-base font-bold">Confirm it's you</h2>
					<p id="elevation-description" class="text-xs leading-relaxed text-muted-foreground">
						Changing who has access needs your password. You'll stay confirmed for 10 minutes, so
						you can make several changes without re-entering it.
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

				{#if captchaEnabled}
					<div class="flex justify-center">
						<Turnstile
							siteKey={PUBLIC_TURNSTILE_SITE_KEY}
							bind:reset={resetCaptcha}
							on:turnstile-callback={(e) => (captchaToken = e.detail.token)}
							on:turnstile-expired={() => (captchaToken = undefined)}
						/>
					</div>
				{/if}

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

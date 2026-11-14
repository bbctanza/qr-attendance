<script lang="ts">
	import { Lock, Loader2 } from '@lucide/svelte';
	import { signIn, type KioskIdentity } from '$lib/kiosk/auth';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	/**
	 * First-boot setup screen. Shown only when the device has no stored session - after this
	 * the session persists, so a restart or power cut comes straight back to Scan.
	 *
	 * This is why the kiosk account's password is never compiled into the app.
	 */
	let {
		ondone,
		onusepairing
	}: {
		/** Hands the resolved identity to the runtime; false means it could not start. */
		ondone: (identity?: KioskIdentity | null) => Promise<boolean>;
		onusepairing: () => void;
	} = $props();

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!email || !password || busy) return;

		busy = true;
		error = '';
		const result = await signIn(email, password);

		if (!result.ok) {
			busy = false;
			error = result.message ?? 'Sign-in failed.';
			password = '';
			return;
		}

		// Stays busy through handover: the runtime loads events before the screen changes, and
		// a button that looks idle for a second invites a second press.
		password = '';
		const started = await ondone(result.identity);
		busy = false;
		if (!started) {
			error = 'Signed in, but the kiosk could not start. Check the connection and try again.';
		}
	}
</script>

<!--
	The church background and the forced-light tokens are copied from the web app's /login page.
	The kiosk runs dark everywhere else, but its sign-in is the one screen a person stands at
	and reads, and it should look like the system's own front door rather than a dark panel.
	The tokens are overridden inline for the same reason the web app does it: the photo is a
	light image, so the card on top of it has to be light regardless of the device theme.
-->
<div
	class="light relative flex flex-1 items-center justify-center p-8 text-foreground"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; --background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --secondary: oklch(0.968 0.007 247.896); --secondary-foreground: oklch(0.208 0.042 265.755); --muted-foreground: oklch(0.554 0.046 257.417); --input: oklch(0.929 0.013 255.508); --input-border: oklch(0.929 0.013 255.508);"
>
	<!-- Overlay for better readability, as on the web app's login. -->
	<div class="absolute inset-0 bg-white/60"></div>

	<div class="relative z-10 w-full max-w-md">
	<form
		onsubmit={submit}
		class="w-full rounded-[var(--radius)] border border-border bg-card p-8 shadow-xl"
	>
		<div class="mb-6 flex items-center gap-3">
			<div class="rounded-full bg-primary/10 p-3 text-primary">
				<Lock size={24} />
			</div>
			<div>
				<h1 class="text-xl font-semibold text-card-foreground">Set up this kiosk</h1>
				<p class="text-sm text-muted-foreground">
					Sign in once with the kiosk account. The device stays signed in after this.
				</p>
			</div>
		</div>

		<label class="mb-1 block text-sm font-medium text-card-foreground" for="kiosk-email">
			Email
		</label>
		<Input
			id="kiosk-email"
			type="email"
			bind:value={email}
			autocomplete="username"
			disabled={busy}
			class="mb-4 h-tap text-base"
			placeholder="kiosk@example.org"
		/>

		<label class="mb-1 block text-sm font-medium text-card-foreground" for="kiosk-password">
			Password
		</label>
		<Input
			id="kiosk-password"
			type="password"
			bind:value={password}
			autocomplete="current-password"
			disabled={busy}
			class="mb-4 h-tap text-base"
			placeholder="••••••••"
		/>

		{#if error}
			<p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
		{/if}

		<Button type="submit" class="h-tap w-full text-base" disabled={busy || !email || !password}>
			{#if busy}
				<Loader2 size={18} class="animate-spin" />
				Signing in…
			{:else}
				Sign in
			{/if}
		</Button>

		<!-- The way back. Pairing is the preferred route, so leaving someone stuck on the
			 account form because they tapped the wrong link once is the wrong default. -->
		<button
			type="button"
			onclick={onusepairing}
			class="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
		>
			Pair with a code instead
		</button>
	</form>
	</div>
</div>

<script lang="ts">
	import { KeyRound, Loader2, TriangleAlert, ArrowLeft, ShieldCheck } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { PinInput } from '$lib/components/ui/pin-input';
	import { Button } from '$lib/components/ui/button';
	import { isValidCodeFormat, normaliseCode, pairDevice } from '$lib/kiosk/pairing';
	import { loadPin, matchesPin, PIN_DIGITS } from '$lib/kiosk/pin';
	import { kiosk } from '$lib/kiosk/state.svelte';

	/**
	 * First boot: bind this device to the system with a one-use code from the web app's
	 * Devices page — PLAN.md section 8.
	 *
	 * No email and no password, which is the whole point. A kiosk is a device the organisation
	 * owns, not a person with an account, and nobody should be typing a credential that
	 * unlocks the web app on a screen at a door.
	 *
	 * Two steps. The first is transcription: a code read off another screen, and a name for
	 * this machine — supplied here because whoever is standing at it knows which door it is on,
	 * where an admin issuing the code from another room is guessing.
	 *
	 * The second does NOT create a PIN. The admin sets that when issuing the code, and the
	 * server returns it, so a field here asking someone to invent one would have been quietly
	 * overwritten. Instead it checks the installer actually has the PIN, while someone who can
	 * fix it is still standing there — the failure this avoids is a kiosk at a door that
	 * nobody present can get into.
	 */
	let {
		ondone,
		onusepassword
	}: {
		/** Hands over to the runtime; false means the session did not come up. */
		ondone: () => Promise<boolean>;
		onusepassword: () => void;
	} = $props();

	let step = $state<1 | 2>(1);
	let code = $state('');
	let deviceName = $state('');
	let pin = $state('');
	let error = $state('');
	let pinError = $state('');
	let busy = $state(false);
	let checking = $state(false);

	const codeReady = $derived(isValidCodeFormat(normaliseCode(code)));
	const stepOneReady = $derived(codeReady && deviceName.trim().length > 0);

	/** Step 1 does the pairing; step 2 only confirms the PIN that came back with it. */
	async function pair(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !stepOneReady) return;

		busy = true;
		error = '';
		const result = await pairDevice(code, deviceName);
		busy = false;

		if (!result.ok) {
			error = result.message ?? 'Pairing failed.';
			return;
		}

		// The name typed here is the device's name on both sides. Without this the web app
		// listed it correctly while the kiosk's own header kept the factory default, and the
		// next screen's "This kiosk is now X" was a claim nothing had acted on.
		kiosk.applyOperational({ deviceName: deviceName.trim() });
		step = 2;
	}

	async function checkPin() {
		if (checking || pin.length !== PIN_DIGITS) return;
		checking = true;
		pinError = '';

		// "No record" and "wrong PIN" are not the same failure and must not share a message:
		// one is fixed by typing more carefully, the other cannot be fixed from this screen
		// at all, and telling the installer to try again would strand them here.
		const record = await loadPin();
		if (!record) {
			checking = false;
			pinError = 'No PIN is stored on this device. Revoke it in the web app and pair again.';
			return;
		}

		if (!(await matchesPin(pin, record))) {
			checking = false;
			pinError = 'That is not the PIN your administrator set.';
			pin = '';
			return;
		}

		// Left busy on success: the runtime loads events before this screen gives way.
		if (!(await ondone())) {
			checking = false;
			pinError = 'Paired, but the kiosk could not start. Check the connection and try again.';
		}
	}
</script>

<!-- Church background and forced-light tokens, as the web app's /login. This is a screen
	 someone stands at and reads. -->
<div
	class="light relative flex flex-1 items-center justify-center overflow-y-auto p-8 text-foreground"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; --background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --secondary: oklch(0.968 0.007 247.896); --secondary-foreground: oklch(0.208 0.042 265.755); --muted-foreground: oklch(0.554 0.046 257.417); --input: oklch(0.929 0.013 255.508); --input-border: oklch(0.929 0.013 255.508);"
>
	<div class="absolute inset-0 bg-white/60"></div>

	<div class="relative z-10 w-full max-w-md">
		<form
			onsubmit={pair}
			class="rounded-[var(--radius)] border border-border bg-card p-8 shadow-xl"
		>
			<!-- Two dashes rather than "Step 1 of 2" in words: it is two steps, and the shape
				 says so faster than the sentence does. -->
			<div class="mb-6 flex items-center gap-2" aria-hidden="true">
				<span class="h-1 flex-1 rounded-full bg-primary"></span>
				<span class="h-1 flex-1 rounded-full {step === 2 ? 'bg-primary' : 'bg-border'}"></span>
			</div>

			{#if step === 1}
				<div class="mb-6 flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-3 text-primary">
						<KeyRound size={24} />
					</div>
					<div>
						<h1 class="text-xl font-semibold text-card-foreground">Pair this kiosk</h1>
						<p class="text-sm text-muted-foreground">
							Open Settings → Kiosk Devices in the web app and pair a kiosk to get a code.
						</p>
					</div>
				</div>

				<span class="mb-2 block text-sm font-medium">Pairing code</span>
				<PinInput
					bind:value={code}
					maxlength={8}
					autofocus
					autocomplete="off"
					aria-label="Pairing code"
				/>
				<p class="mt-1.5 mb-4 text-xs text-muted-foreground">
					Expires ten minutes after it is created, and works only once.
				</p>

				<label class="mb-1 block text-sm font-medium" for="pair-name">Name this device</label>
				<Input
					id="pair-name"
					bind:value={deviceName}
					class="h-tap text-base"
					placeholder="Main Gate"
				/>
				<p class="mt-1.5 mb-6 text-xs text-muted-foreground">
					How this kiosk is listed in the web app, and shown in its own header.
				</p>

				{#if error}
					<p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
				{/if}

				<Button type="submit" class="h-tap w-full text-base" disabled={!stepOneReady || busy}>
					{#if busy}
						<Loader2 size={18} class="animate-spin" />
						Pairing…
					{:else}
						Pair this device
					{/if}
				</Button>

				<!-- Account sign-in stays reachable until every kiosk is paired; the rollout in
					 PLAN.md 8.8 has no flag day. -->
				<button
					type="button"
					onclick={onusepassword}
					class="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
				>
					Sign in with an account instead
				</button>
			{:else}
				<div class="mb-6 flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-3 text-primary">
						<ShieldCheck size={24} />
					</div>
					<div>
						<h1 class="text-xl font-semibold text-card-foreground">Paired</h1>
						<p class="text-sm text-muted-foreground">
							This kiosk is now <span class="font-medium text-card-foreground">{deviceName}</span>.
						</p>
					</div>
				</div>

				<span class="mb-2 block text-sm font-medium">Confirm the settings PIN</span>
				<PinInput
					bind:value={pin}
					maxlength={PIN_DIGITS}
					inputmode="numeric"
					mask
					autofocus
					oncomplete={checkPin}
					autocomplete="one-time-code"
					aria-label="Settings PIN"
				/>
				<p class="mt-1.5 mb-6 text-xs text-muted-foreground">
					The {PIN_DIGITS} digits your administrator set when they made the code. This is the
					only way into Settings once the device is on a door, so it is confirmed here while
					someone who can fix it is still standing in front of it.
				</p>

				{#if pinError}
					<p class="mb-4 text-sm text-destructive" role="alert">{pinError}</p>
				{/if}

				<Button
					type="button"
					class="h-tap w-full text-base"
					disabled={checking || pin.length !== PIN_DIGITS}
					onclick={checkPin}
				>
					{checking ? 'Checking…' : 'Confirm and start'}
				</Button>

			{/if}
		</form>
	</div>
</div>

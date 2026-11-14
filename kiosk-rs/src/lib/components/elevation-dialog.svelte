<script lang="ts">
	import { Lock } from '@lucide/svelte';
	import { elevate, elevateWithPin, hasPin } from '$lib/kiosk/elevation';
	import PinKeypad from './pin-keypad.svelte';
	import { PIN_DIGITS } from '$lib/kiosk/pin';
	import { kiosk } from '$lib/kiosk/state.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(false),
		title = 'Kiosk settings',
		description = 'Confirm the account password to continue.',
		ongranted
	}: {
		open?: boolean;
		title?: string;
		description?: string;
		ongranted: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let password = $state('');
	let pin = $state('');

	/**
	 * Which form to show. A device that has been paired has a PIN; one still signed in with
	 * the old staff account does not, and must keep working until it is paired - see PLAN.md
	 * section 8.8, the rollout has no flag day.
	 */
	let usePin = $state(false);
	let lockedUntil = $state(0);
	let lockedLabel = $state('');

	$effect(() => {
		if (open) void hasPin().then((has) => (usePin = has));
	});

	/** Counts the lockout down on screen rather than leaving a dead keypad with no reason. */
	$effect(() => {
		if (lockedUntil === 0) return;
		const tick = () => {
			const left = Math.max(0, lockedUntil - Date.now());
			if (left === 0) {
				lockedUntil = 0;
				lockedLabel = '';
				error = '';
				return;
			}
			const seconds = Math.ceil(left / 1000);
			const minutes = Math.floor(seconds / 60);
			lockedLabel =
				minutes > 0 ? `${minutes} min ${seconds % 60} s` : `${seconds} second${seconds === 1 ? '' : 's'}`;
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	});

	async function submitPin() {
		if (checking || pin.length !== PIN_DIGITS) return;
		checking = true;
		error = '';

		const result = await elevateWithPin(pin, kiosk.settings.elevationMinutes);
		checking = false;
		pin = '';

		if (result.ok) {
			close();
			ongranted();
			return;
		}

		if (result.lockedForMs > 0) {
			lockedUntil = Date.now() + result.lockedForMs;
			error = 'Too many wrong PINs.';
			return;
		}
		error = 'That PIN was not accepted. Try again.';
	}
	let error = $state('');
	let checking = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	function close() {
		password = '';
		pin = '';
		error = '';
		checking = false;
		open = false;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!password) return;
		checking = true;
		error = '';

		// Verified against the signed-in account on a throwaway client, so the kiosk's own
		// session is never disturbed. See $lib/kiosk/auth.ts.
		const granted = await elevate(password, kiosk.settings.elevationMinutes);

		checking = false;
		if (!granted) {
			error = 'That password was not accepted. Try again.';
			password = '';
			return;
		}
		close();
		ongranted();
	}
</script>

<dialog
	bind:this={dialog}
	onclose={close}
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
	class="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-card
		p-7 text-card-foreground shadow-2xl shadow-black/40 backdrop:bg-black/70
		backdrop:backdrop-blur-sm"
>
	{#if usePin}
		<div class="flex flex-col items-center">
			<div class="flex w-full items-center gap-3">
				<span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12">
					<Lock class="size-5 text-primary" aria-hidden="true" />
				</span>
				<h2 class="text-lg font-semibold tracking-tight">{title}</h2>
			</div>

			<p class="mt-3 w-full text-sm leading-relaxed text-muted-foreground">
				Enter this device's {PIN_DIGITS}-digit PIN.
			</p>

			<div class="mt-7">
				<PinKeypad
					bind:value={pin}
					length={PIN_DIGITS}
					disabled={checking || lockedUntil > 0}
					onsubmit={submitPin}
				/>
			</div>

			{#if lockedUntil > 0}
				<p class="mt-5 text-center text-sm font-medium text-destructive" role="alert">
					Too many wrong PINs. Try again in {lockedLabel}.
				</p>
			{:else if error}
				<p class="mt-5 text-center text-sm text-destructive" role="alert">{error}</p>
			{/if}

			<button
				type="button"
				onclick={close}
				class="mt-6 h-tap w-full rounded-lg border border-border text-base font-medium
					transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring
					focus-visible:outline-none"
			>
				Cancel
			</button>
		</div>
	{:else}
	<form onsubmit={submit} class="flex flex-col">
		<div class="flex items-center gap-3">
			<span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12">
				<Lock class="size-5 text-primary" aria-hidden="true" />
			</span>
			<h2 class="text-lg font-semibold tracking-tight">{title}</h2>
		</div>

		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>

		<label for="elevation-password" class="mt-6 text-sm font-medium">Account password</label>
		<Input
			id="elevation-password"
			type="password"
			bind:value={password}
			autocomplete="current-password"
			disabled={checking}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? 'elevation-error' : undefined}
			class="mt-2 h-tap text-base"
		/>

		{#if error}
			<p id="elevation-error" class="mt-2 text-sm text-destructive">{error}</p>
		{/if}

		<div class="mt-7 flex gap-3">
			<Button variant="outline" class="h-tap flex-1 text-base" onclick={close}>Cancel</Button>
			<Button type="submit" class="h-tap flex-1 text-base" disabled={!password || checking}>
				{checking ? 'Checking…' : 'Unlock'}
			</Button>
		</div>
	</form>
	{/if}
</dialog>

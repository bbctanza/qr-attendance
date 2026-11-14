<script lang="ts">
	import { LogIn } from '@lucide/svelte';
	import { switchAccount } from '$lib/kiosk/auth';
	import { logEscapeHatch } from '$lib/kiosk/audit';
	import { kiosk } from '$lib/kiosk/state.svelte';
	import { release } from '$lib/kiosk/elevation';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	/**
	 * The escape hatch (PLAN.md section 3). Reached from Kiosk Settings, which is already
	 * behind the elevation gate, so this doesn't re-gate - it asks for the credentials of the
	 * account taking over.
	 *
	 * The kiosk view never changes. On success the device returns to the scan screen, still a
	 * kiosk, just recording scans as somebody else.
	 */
	let { open = $bindable(false), ondone }: { open?: boolean; ondone: () => void } = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	function close() {
		email = '';
		password = '';
		error = '';
		busy = false;
		open = false;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!email || !password || busy) return;

		busy = true;
		error = '';

		const previousEmail = kiosk.identity?.email ?? 'unknown';
		const result = await switchAccount(email, password);

		if (!result.ok || !result.identity) {
			busy = false;
			error = result.message ?? 'Sign-in failed.';
			password = '';
			return;
		}

		kiosk.identity = result.identity;
		// The hold was earned with the previous account's password; it does not carry over.
		release();

		// The trail is the point of the escape hatch, but a failed audit write must not strand
		// the operator - they are mid-queue at a door. Surfaced on screen, not blocking.
		const logged = await logEscapeHatch({
			previousEmail,
			next: result.identity,
			deviceName: kiosk.settings.deviceName
		});
		if (!logged) {
			console.warn('[kiosk] escape hatch used but the audit write failed');
		}

		// The new account may see a different set of ongoing events, so reload rather than
		// carrying the previous account's view forward.
		void kiosk.beginSession();

		busy = false;
		close();
		ondone();
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
	<form onsubmit={submit} class="flex flex-col">
		<div class="flex items-center gap-3">
			<span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12">
				<LogIn class="size-5 text-primary" aria-hidden="true" />
			</span>
			<h2 class="text-lg font-semibold tracking-tight">Sign in as a different account</h2>
		</div>

		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			Scans will be recorded as this account until the device is signed out. The screen
			stays a kiosk. This is written to the audit log.
		</p>

		<label for="switch-email" class="mt-6 text-sm font-medium">Email</label>
		<Input
			id="switch-email"
			type="email"
			bind:value={email}
			autocomplete="username"
			disabled={busy}
			class="mt-2 h-tap text-base"
		/>

		<label for="switch-password" class="mt-4 text-sm font-medium">Password</label>
		<Input
			id="switch-password"
			type="password"
			bind:value={password}
			autocomplete="current-password"
			disabled={busy}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? 'switch-error' : undefined}
			class="mt-2 h-tap text-base"
		/>

		{#if error}
			<p id="switch-error" class="mt-2 text-sm text-destructive">{error}</p>
		{/if}

		<div class="mt-7 flex gap-3">
			<Button variant="outline" class="h-tap flex-1 text-base" disabled={busy} onclick={close}>
				Cancel
			</Button>
			<Button type="submit" class="h-tap flex-1 text-base" disabled={!email || !password || busy}>
				{busy ? 'Signing in…' : 'Switch account'}
			</Button>
		</div>
	</form>
</dialog>

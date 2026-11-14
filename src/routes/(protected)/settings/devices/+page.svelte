<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { siteConfig } from '$lib/config/site';
	import PageShell from '$lib/components/page-shell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { PinInput } from '$lib/components/ui/pin-input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { toast } from 'svelte-sonner';
	import {
		MonitorSmartphone,
		Plus,
		KeyRound,
		Pencil,
		Ban,
		Copy,
		Check,
		History
	} from '@lucide/svelte';
	import { devicesApi, type KioskDevice } from '$lib/api/devices';
	import { logAuditChange } from '$lib/utils/auditLogger';
	import { supabase } from '$lib/supabase';
	import { ensureElevated, elevation } from '$lib/stores/elevation';
	import ElevationDialog from '$lib/components/elevation-dialog.svelte';

	/**
	 * Kiosk devices — see kiosk-rs/PLAN.md section 8.
	 *
	 * This page exists so a kiosk never needs a human's account. Pairing gives a device its
	 * own identity; revoking takes it away without touching anything else. Previously a kiosk
	 * ran on an invited staff account, which meant an account password was typed at a door and
	 * one kiosk could not be disabled on its own.
	 *
	 * Creating, renaming, re-PINing and revoking a device are access changes, and the service
	 * treats them like inviting or removing a user: admin rights plus a live elevation.
	 * Identity is confirmed once through ElevationDialog and held, so a run of changes does
	 * not mean a password per change. Reading the list needs no confirmation.
	 */
	let devices = $state<KioskDevice[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	let pairOpen = $state(false);
	let newPin = $state('');
	let confirmPin = $state('');
	let issuing = $state(false);
	let issuedCode = $state<string | null>(null);
	let copied = $state(false);

	// Each modal binds a plain boolean with `bind:open`, with the target held separately.
	// A one-way `open={!!target}` leaves the component unable to close itself - which is
	// how these ended up unclosable.
	let renameOpen = $state(false);
	let renaming = $state<KioskDevice | null>(null);
	let renameValue = $state('');

	let resetOpen = $state(false);
	let resetting = $state<KioskDevice | null>(null);
	let resetPin = $state('');
	let resetConfirm = $state('');

	let revokeOpen = $state(false);
	let revoking = $state<KioskDevice | null>(null);
	let working = $state(false);

	/**
	 * Run something that needs identity confirmation, without stacking modals.
	 *
	 * AlertDialog traps focus, so opening the elevation prompt on top of an already-open
	 * modal left its password field unreachable - the prompt appeared but could not be typed
	 * into, which read as "confirm password is broken". Closing the first modal first is both
	 * the fix and the better flow: confirm once, then the action goes through on its own.
	 *
	 * Inputs live on the page rather than inside the modals, so nothing is lost while the
	 * modal is shut, and `reopen` puts the operator back where they were if they cancel.
	 */
	async function withConfirmation(
		close: () => void,
		reopen: () => void,
		run: () => Promise<void>
	) {
		// Already confirmed: nothing is closed, so the common path has no flicker. Same
		// approach as elevateClear() in the Access Directory page.
		if (elevation.current()) {
			await run();
			return;
		}

		close();
		// Let the modal actually unmount before the next opens, or the focus trap it is
		// tearing down fights the one being set up.
		await tick();

		if (!(await ensureElevated())) {
			reopen();
			return;
		}
		await run();
	}

	const SIX_DIGITS = /^[0-9]{6}$/;
	const pinValid = $derived(SIX_DIGITS.test(newPin) && newPin === confirmPin);
	const resetValid = $derived(SIX_DIGITS.test(resetPin) && resetPin === resetConfirm);

	/** Small and local: nothing in $lib/utils/time does relative phrasing. */
	function seenAgo(iso: string): string {
		const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
		if (seconds < 90) return 'just now';
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours} hr ago`;
		const days = Math.round(hours / 24);
		return `${days} day${days === 1 ? '' : 's'} ago`;
	}

	async function load() {
		loading = true;
		loadError = null;
		try {
			// Active devices only. Revoked ones and spent or expired codes are history, and
			// live on the History page rather than cluttering the list of what is running.
			devices = (await devicesApi.list()).filter((d) => d.status === 'active');
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Could not load devices.';
		}
		loading = false;
	}

	onMount(load);

	async function audit(
		action: 'create' | 'update' | 'delete',
		entityId: string,
		reason: string
	) {
		const { data } = await supabase.auth.getSession();
		await logAuditChange(
			{ entityType: 'user', entityId, action, reason, tags: ['kiosk-device'] },
			data.session
		);
	}

	async function issueCode() {
		if (!pinValid || issuing) return;

		await withConfirmation(
			() => (pairOpen = false),
			() => (pairOpen = true),
			async () => {
				issuing = true;
				try {
					const result = await devicesApi.createPairingCode(newPin);
					issuedCode = result.code;
					await audit('create', result.code, 'Kiosk pairing code issued.');
					// Back to the same modal, now showing the code rather than the form.
					pairOpen = true;
				} catch (e) {
					toast.error(e instanceof Error ? e.message : 'Could not create a pairing code.');
					pairOpen = true;
				}
				issuing = false;
			}
		);
	}

	/** Shown once and never stored in the browser, so this is the only chance to copy it. */
	async function copyCode() {
		if (!issuedCode) return;
		try {
			await navigator.clipboard.writeText(issuedCode);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error('Could not copy. Read the code out to whoever is at the kiosk.');
		}
	}

	function closePair() {
		pairOpen = false;
		newPin = '';
		confirmPin = '';
		issuedCode = null;
		void load();
	}

	async function doRename() {
		if (!renaming || !renameValue.trim() || working) return;

		await withConfirmation(
			() => (renameOpen = false),
			() => (renameOpen = true),
			async () => {
				working = true;
				try {
					await devicesApi.rename(renaming!.id, renameValue.trim());
					await audit('update', renaming!.id, `Kiosk renamed to "${renameValue.trim()}".`);
					toast.success('Device renamed.');
					await load();
				} catch (e) {
					toast.error(e instanceof Error ? e.message : 'Rename failed.');
					renameOpen = true;
				}
				working = false;
			}
		);
	}

	async function doResetPin() {
		if (!resetting || !resetValid || working) return;

		await withConfirmation(
			() => (resetOpen = false),
			() => (resetOpen = true),
			async () => {
				working = true;
				try {
					await devicesApi.resetPin(resetting!.id, resetPin);
					await audit('update', resetting!.id, `Kiosk PIN reset for "${resetting!.name}".`);
					toast.success('PIN reset. The device applies it the next time it checks in.');
					resetPin = '';
					resetConfirm = '';
				} catch (e) {
					toast.error(e instanceof Error ? e.message : 'Could not reset the PIN.');
					resetOpen = true;
				}
				working = false;
			}
		);
	}

	async function doRevoke() {
		if (!revoking || working) return;

		await withConfirmation(
			() => (revokeOpen = false),
			() => (revokeOpen = true),
			async () => {
				working = true;
				try {
					await devicesApi.revoke(revoking!.id);
					await audit('delete', revoking!.id, `Kiosk "${revoking!.name}" revoked.`);
					toast.success(`${revoking!.name} can no longer record attendance.`);
					await load();
				} catch (e) {
					toast.error(e instanceof Error ? e.message : 'Could not revoke the device.');
					revokeOpen = true;
				}
				working = false;
			}
		);
	}
</script>

<svelte:head>
	<title>Kiosk Devices | {siteConfig.name}</title>
</svelte:head>

<PageShell
	title="Kiosk Devices"
	description="Attendance kiosks paired to this system. Each uses its own identity, not a staff account."
	backTo="/settings"
	isLoading={loading}
	error={loadError}
	onRetry={load}
>
	{#snippet actions()}
		<Button variant="outline" href="/settings/devices/history">
			<History class="mr-2 h-4 w-4" /> History
		</Button>
		<Button onclick={() => (pairOpen = true)}>
			<Plus class="mr-2 h-4 w-4" /> Pair a kiosk
		</Button>
	{/snippet}

	{#if devices.length === 0}
		<Card>
			<CardContent class="flex flex-col items-center gap-4 py-16 text-center">
				<div class="rounded-full bg-muted p-4">
					<MonitorSmartphone class="h-8 w-8 text-muted-foreground" />
				</div>
				<div>
					<p class="font-semibold">No kiosks paired yet</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Pair a device so it can record attendance without signing in as a person.
					</p>
				</div>
				<Button onclick={() => (pairOpen = true)}>
					<Plus class="mr-2 h-4 w-4" /> Pair a kiosk
				</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			{#each devices as device (device.id)}
				<Card class={device.status === 'revoked' ? 'opacity-60' : ''}>
					<CardHeader class="pb-3">
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-center gap-2">
								<MonitorSmartphone class="h-5 w-5 shrink-0 text-primary" />
								<CardTitle class="text-base sm:text-lg">{device.name}</CardTitle>
							</div>
							{#if device.status === 'revoked'}
								<Badge variant="destructive">Revoked</Badge>
							{:else if device.last_seen_at}
								<Badge variant="secondary">Seen {seenAgo(device.last_seen_at)}</Badge>
							{:else}
								<Badge variant="outline">Never connected</Badge>
							{/if}
						</div>
					</CardHeader>
					<CardContent class="space-y-4">
						<dl class="grid grid-cols-2 gap-2 text-sm">
							<dt class="text-muted-foreground">Paired by</dt>
							<dd class="text-right">{device.paired_by_email ?? 'Unknown'}</dd>
							<dt class="text-muted-foreground">App version</dt>
							<dd class="text-right font-mono">{device.app_version ?? '—'}</dd>
						</dl>

						{#if device.status === 'active'}
							<div class="flex flex-wrap gap-2">
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										renaming = device;
										renameValue = device.name;
										renameOpen = true;
									}}
								>
									<Pencil class="mr-2 h-4 w-4" /> Rename
								</Button>
								<Button variant="outline" size="sm" onclick={() => {
										resetting = device;
										resetOpen = true;
									}}>
									<KeyRound class="mr-2 h-4 w-4" /> Reset PIN
								</Button>
								<Button variant="destructive" size="sm" onclick={() => {
										revoking = device;
										revokeOpen = true;
									}}>
									<Ban class="mr-2 h-4 w-4" /> Revoke
								</Button>
							</div>
						{/if}
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</PageShell>

<AlertDialog.Root bind:open={pairOpen} onOpenChange={(o) => !o && closePair()}>
	<AlertDialog.Content class="sm:max-w-md">
		{#if issuedCode}
			<AlertDialog.Header>
				<AlertDialog.Title>Enter this on the kiosk</AlertDialog.Title>
				<AlertDialog.Description>
					Valid for 10 minutes, and only once. It is not shown again.
				</AlertDialog.Description>
			</AlertDialog.Header>

			<div class="my-4 rounded-xl border bg-muted/40 p-6 text-center">
				<p class="font-mono text-3xl font-bold tracking-[0.3em]">{issuedCode}</p>
			</div>

			<AlertDialog.Footer class="gap-2">
				<Button variant="outline" onclick={copyCode}>
					{#if copied}
						<Check class="mr-2 h-4 w-4" /> Copied
					{:else}
						<Copy class="mr-2 h-4 w-4" /> Copy
					{/if}
				</Button>
				<Button onclick={closePair}>Done</Button>
			</AlertDialog.Footer>
		{:else}
			<AlertDialog.Header>
				<AlertDialog.Title>Pair a kiosk</AlertDialog.Title>
				<AlertDialog.Description>
					Set the PIN that opens this kiosk's settings, then read the code to whoever is
					at the device. Nobody signs in.
				</AlertDialog.Description>
			</AlertDialog.Header>

			<div class="space-y-4 py-2">
				<p class="text-sm text-muted-foreground">
					The kiosk is named by whoever sets it up — they know which door it is on.
				</p>
				<div class="space-y-2">
					<Label>Settings PIN (6 digits)</Label>
					<PinInput
						bind:value={newPin}
						maxlength={6}
						inputmode="numeric"
						mask
						autofocus
						aria-label="Settings PIN"
					/>
				</div>
				<div class="space-y-2">
					<Label>Confirm PIN</Label>
					<PinInput
						bind:value={confirmPin}
						maxlength={6}
						inputmode="numeric"
						mask
						oncomplete={() => pinValid && issueCode()}
						aria-label="Confirm the PIN"
					/>
					{#if confirmPin.length === 6 && newPin !== confirmPin}
						<p class="text-sm text-destructive">The PINs do not match.</p>
					{/if}
				</div>
			</div>

			<AlertDialog.Footer>
				<Button variant="outline" onclick={closePair}>Cancel</Button>
				<Button disabled={!pinValid || issuing} onclick={issueCode}>
					{issuing ? 'Creating…' : 'Create pairing code'}
				</Button>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={renameOpen}>
	<AlertDialog.Content class="sm:max-w-sm">
		<AlertDialog.Header>
			<AlertDialog.Title>Rename device</AlertDialog.Title>
		</AlertDialog.Header>
		<!-- svelte-ignore a11y_autofocus -- the only field in a dialog opened to edit it -->
		<Input
			bind:value={renameValue}
			autofocus
			onkeydown={(e) => {
				if (e.key === 'Enter' && renameValue.trim() && !working) doRename();
			}}
			class="my-2"
		/>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (renameOpen = false)}>Cancel</Button>
			<Button disabled={!renameValue.trim() || working} onclick={doRename}>Save</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={resetOpen}>
	<AlertDialog.Content class="sm:max-w-md">
		<AlertDialog.Header>
			<AlertDialog.Title>Reset PIN</AlertDialog.Title>
			<AlertDialog.Description>
				The device applies this the next time it checks in, within about a minute.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="space-y-4 py-2">
			<div class="space-y-2">
				<Label>New PIN</Label>
				<PinInput
					bind:value={resetPin}
					maxlength={6}
					inputmode="numeric"
					mask
					autofocus
					aria-label="New PIN"
				/>
			</div>
			<div class="space-y-2">
				<Label>Confirm</Label>
				<PinInput
					bind:value={resetConfirm}
					maxlength={6}
					inputmode="numeric"
					mask
					oncomplete={() => resetValid && doResetPin()}
					aria-label="Confirm the new PIN"
				/>
			</div>
		</div>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (resetOpen = false)}>Cancel</Button>
			<Button disabled={!resetValid || working} onclick={doResetPin}>Reset PIN</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={revokeOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Revoke {revoking?.name}?</AlertDialog.Title>
			<AlertDialog.Description>
				It stops recording attendance as soon as it next reaches the server, and the same
				code cannot be used again. Scans it already recorded are kept.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={doRevoke} disabled={working}>Revoke</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- One dialog answers every elevation request on this page. -->
<ElevationDialog />

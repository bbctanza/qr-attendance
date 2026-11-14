<script lang="ts">
	import { kiosk } from '$lib/kiosk/state.svelte';
	import SwitchAccountDialog from './switch-account-dialog.svelte';
	import { formatClock } from '$lib/kiosk/format';
	import { usingKeyring } from '$lib/kiosk/secure-storage';
	import { APP_VERSION } from '$lib/kiosk/version';
	import SettingRow from './setting-row.svelte';
	// The web app's shadcn components, copied verbatim from src/lib/components/ui — same
	// system, same look, no second implementation to keep in step.
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import {
		Moon,
		Sun,
		RefreshCw,
		RotateCcw,
		LogIn,
		Check,
		Monitor,
		ScanLine,
		CalendarDays,
		UserRound,
		Info,
		Save,
		TriangleAlert,
		Construction,
		Trash2,
		LogOut
	} from '@lucide/svelte';
	import { dev } from '$lib/kiosk/dev.svelte';
	import { fly } from 'svelte/transition';

	/**
	 * Two-pane settings: categories on the left, one group at a time on the right.
	 *
	 * The previous version was twenty-two rows in a single scroll, with every control pinned to
	 * the far right edge - a shape that assumes a mouse and a steady hand. On a door-mounted
	 * laptop it meant scrolling to hunt for a setting and then reaching across the screen to
	 * hit a 44px target. Here nothing scrolls to be found: one tap picks a category and its
	 * controls are already in view.
	 *
	 * Implemented as a real tablist rather than a custom widget, so keyboard and screen-reader
	 * behaviour is the platform's: arrows move between categories, Home/End jump to the ends,
	 * Tab moves on into the panel. Roving tabindex keeps the rail a single tab stop.
	 *
	 * Below `md` the rail becomes a horizontal strip of chips above the panel - a 17rem rail
	 * would leave nothing usable beside it on a narrow screen.
	 */
	// The screen is only mounted with a draft open, so this is safe and keeps every binding
	// below free of `?.` noise.
	const draft = $derived(kiosk.draft!);

	let saving = $state(false);
	let justSaved = $state(false);

	async function save() {
		saving = true;
		const ok = kiosk.saveDraft();
		saving = false;
		if (ok) {
			justSaved = true;
			setTimeout(() => (justSaved = false), 1800);
		}
	}

	let lastSync = $state(new Date());
	let switchOpen = $state(false);
	let showQueue = $state(false);
	let signOutArmed = $state(false);
	let signingOut = $state(false);

	/** Re-read on each open rather than holding a copy: the queue drains underneath this. */
	const pending = $derived(showQueue && kiosk.queued >= 0 ? kiosk.pendingScans() : []);

	type SectionId = 'device' | 'input' | 'event' | 'sync' | 'account' | 'about' | 'dev';

	/**
	 * Settings has to work on a device that is not signed in.
	 *
	 * A kiosk is configured before it is paired, not after: it has to be put into fullscreen,
	 * told to start with the machine, and given the right clock format while it is still
	 * sitting on a desk. Locking all of that behind a session meant the only way to reach it
	 * was to pair the device first, which is backwards.
	 *
	 * What stays out: Event, Sync and Account are all about a signed-in device and have
	 * nothing to show without one. **Developer Tools is excluded deliberately** - its flags
	 * change how scans behave, and the gate on them is the settings PIN, which an unpaired
	 * device does not have. Nothing left in here touches attendance data or an account, so
	 * nothing left in here needs a credential the device cannot yet check.
	 */
	const signedOut = $derived(!kiosk.identity);
	const SIGNED_OUT_SECTIONS: SectionId[] = ['device', 'input', 'about'];

	/**
	 * Developer Tools is unlocked by tapping the version seven times (see dev.svelte.ts), not
	 * by the signed-in account's role - debugging should not cost the audit trail.
	 */
	const isDeveloper = $derived(dev.unlocked && !signedOut);

	/** What the version row says back after a tap. Cleared after a moment, like a toast. */
	let tapMessage = $state<string | null>(null);
	let tapTimer: ReturnType<typeof setTimeout> | null = null;

	function tapVersion() {
		// The unlock gesture is part of Developer Tools, so it is out for the same reason.
		if (signedOut) return;
		const result = dev.tapVersion();
		if (!result) return;
		tapMessage = result.message;
		if (tapTimer) clearTimeout(tapTimer);
		tapTimer = setTimeout(() => (tapMessage = null), 2600);
	}

	/** Windows/macOS/Linux from the UA. Android's About shows the OS; this is the equivalent. */
	const platform = $derived.by(() => {
		if (typeof navigator === 'undefined') return 'Unknown';
		const ua = navigator.userAgent;
		if (ua.includes('Windows')) return 'Windows';
		if (ua.includes('Mac OS')) return 'macOS';
		if (ua.includes('Linux')) return 'Linux';
		return 'Unknown';
	});

	const baseSections: { id: SectionId; label: string; icon: typeof Monitor; blurb: string }[] = [
		{ id: 'device', label: 'Device', icon: Monitor, blurb: 'Identifies this machine and controls how it starts.' },
		{ id: 'input', label: 'Scanning', icon: ScanLine, blurb: 'Set once. Day-to-day input and sound are in the quick controls (tap the gear).' },
		{ id: 'event', label: 'Event', icon: CalendarDays, blurb: 'Which event this device records attendance for.' },
		{ id: 'sync', label: 'Sync', icon: RefreshCw, blurb: 'Whether everything scanned here has reached the server.' },
		{ id: 'account', label: 'Account', icon: UserRound, blurb: 'Who this device records scans as.' },
		{ id: 'about', label: 'About', icon: Info, blurb: 'This device, and the system it belongs to.' }
	];

	/** Developer Tools is appended, not inserted, so the ordinary sections never shift. */
	const visibleBase = $derived(
		signedOut ? baseSections.filter((s) => SIGNED_OUT_SECTIONS.includes(s.id)) : baseSections
	);

	const sections = $derived(
		isDeveloper
			? [
					...visibleBase,
					{
						id: 'dev' as SectionId,
						label: 'Developer Tools',
						icon: Construction,
						blurb: 'Debug & test features. Nothing here is written to attendance data.'
					}
				]
			: visibleBase
	);

	let active = $state<SectionId>('device');

	/**
	 * Signing out while a now-hidden section is open would leave `current` undefined and take
	 * the whole screen down with it. Fall back rather than crash.
	 */
	$effect(() => {
		if (!sections.some((s) => s.id === active)) active = 'device';
	});
	let tabs: HTMLButtonElement[] = [];

	const current = $derived(sections.find((s) => s.id === active)!);

	/** Only *ongoing* events can be pinned: pinning to one that hasn't started would leave the
	 *  kiosk in standby refusing every scan, because nothing resolves as the active event. */
	const events = $derived(kiosk.ongoing);

	/** Arrow keys move selection and focus together, as a tablist is expected to. */
	function onRailKey(event: KeyboardEvent) {
		const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		event.preventDefault();

		const index = sections.findIndex((s) => s.id === active);
		let next = index;
		if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = sections.length - 1;
		else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % sections.length;
		else next = (index - 1 + sections.length) % sections.length;

		active = sections[next].id;
		tabs[next]?.focus();
	}

	/**
	 * Theme is part of the draft like everything else, but previews immediately - a colour
	 * scheme you cannot see until you commit is not a choice you can actually make. Leaving
	 * without saving reverts it, which is what `discardDraft()` re-applies.
	 */
	function toggleTheme() {
		draft.theme = draft.theme === 'dark' ? 'light' : 'dark';
		// Paint only. Writing it into `settings` here is what stopped the save bar appearing,
		// because the draft and the stored value then changed together.
		kiosk.applyTheme(draft.theme);
	}

	/**
	 * The event select speaks strings, because that is what a DOM select value is. `null`
	 * (follow whatever is ongoing) is carried as the sentinel "auto" rather than an empty
	 * string, so it can never be confused with "no selection yet".
	 */
	const pinnedValue = $derived(
		draft.pinnedEventId === null ? 'auto' : String(draft.pinnedEventId)
	);

	const pinnedLabel = $derived(
		draft.pinnedEventId === null
			? 'Follow whichever is ongoing'
			: (events.find((e) => e.event_id === draft.pinnedEventId)?.event_name ??
				'Follow whichever is ongoing')
	);

	function setPinned(value: string) {
		draft.pinnedEventId = value === 'auto' ? null : Number(value);
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<div class="flex min-h-0 flex-1 flex-col md:flex-row">
		<!-- Rail. Vertical beside the panel on a kiosk screen, a scrolling chip strip when the
			 window is too narrow to give both a usable width.
			 A plain div, not <nav>: a tablist switches panels in place, it does not navigate,
			 and announcing it as a navigation landmark would be a lie to a screen reader.
			 tabindex -1, not 0: the tabs themselves carry the roving tabindex, so the container
			 has to be focusable programmatically without becoming a tab stop of its own. -->
		<div
			role="tablist"
			aria-label="Settings categories"
			aria-orientation="vertical"
			onkeydown={onRailKey}
			tabindex={-1}
			class="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border p-2
				md:w-[17rem] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r
				md:border-b-0 md:p-3"
		>
			{#each sections as section, i (section.id)}
				{@const selected = active === section.id}
				<button
					bind:this={tabs[i]}
					type="button"
					role="tab"
					id="tab-{section.id}"
					aria-selected={selected}
					aria-controls="panel-{section.id}"
					tabindex={selected ? 0 : -1}
					onclick={() => (active = section.id)}
					class="flex h-14 shrink-0 items-center gap-3 rounded-xl px-4 text-left text-base
						font-medium whitespace-nowrap transition-colors focus-visible:ring-2
						focus-visible:ring-ring focus-visible:outline-none md:h-16 md:w-full
						{selected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
				>
					<section.icon
						class="size-5 shrink-0 {selected ? '' : 'text-muted-foreground'}"
						aria-hidden="true"
					/>
					{section.label}
					{#if section.id === 'sync' && kiosk.queued > 0}
						<!-- A backlog is the one thing worth surfacing before the category is opened. -->
						<span
							class="ml-auto rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums
								{selected ? 'bg-primary-foreground/20' : 'bg-kiosk-duplicate/20 text-kiosk-duplicate'}"
						>
							{kiosk.queued}
						</span>
					{/if}
				</button>
			{/each}

			{#if signedOut}
				<!-- Says why the list is short. Three categories with no explanation reads as a
					 broken screen; naming what is missing and what brings it back does not. -->
				<p class="hidden px-4 pt-3 text-xs leading-snug text-muted-foreground md:block">
					Event, Sync and Account appear once this device is paired.
				</p>
			{/if}
		</div>

		<div
			role="tabpanel"
			id="panel-{active}"
			aria-labelledby="tab-{active}"
			tabindex="0"
			class="min-h-0 flex-1 overflow-y-auto px-6 py-7 focus-visible:outline-none md:px-9"
		>
			<div class="mx-auto max-w-2xl">
				<h3 class="text-[22px] font-semibold tracking-tight">{current.label}</h3>
				<p class="mt-1 text-sm text-muted-foreground">{current.blurb}</p>

				<div class="mt-7 divide-y divide-border">
					{#if active === 'device'}
						<SettingRow label="Kiosk name" description="Identifies this device in the audit log.">
							{#snippet control()}
								<Input
									type="text"
									bind:value={draft.deviceName}
									class="h-tap w-56 text-base"
									aria-label="Kiosk name"
								/>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Theme"
							description="Dark suits indoor halls; light survives daylight entrances."
						>
							{#snippet control()}
								<Button variant="outline" size="lg" class="h-tap px-5 text-base" onclick={toggleTheme}>
									{#if draft.theme === 'dark'}
										<Moon class="size-4" aria-hidden="true" /> Dark
									{:else}
										<Sun class="size-4" aria-hidden="true" /> Light
									{/if}
								</Button>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Fullscreen lock"
							description={kiosk.shell
								? 'Real OS fullscreen — a stray keypress cannot drop out of it.'
								: 'Only available in the installed app, not in a browser.'}
						>
							{#snippet control()}
								<Switch
									class="scale-150"
									checked={kiosk.settings.fullscreenLock}
									disabled={!kiosk.shell}
									onCheckedChange={(v) => kiosk.setFullscreenLock(v)}
									aria-label="Fullscreen lock"
								/>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Start on boot"
							description={kiosk.shell
								? 'Registers with the operating system, so it survives a power cut.'
								: 'Only available in the installed app, not in a browser.'}
						>
							{#snippet control()}
								<Switch
									class="scale-150"
									checked={kiosk.settings.startOnBoot}
									disabled={!kiosk.shell}
									onCheckedChange={(v) => kiosk.setStartOnBoot(v)}
									aria-label="Start on boot"
								/>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Ask for the password again after"
							description="How long Settings stays unlocked once you've entered the password."
						>
							{#snippet control()}
								<Select.Root
									type="single"
									value={String(draft.elevationMinutes)}
									onValueChange={(v) => (draft.elevationMinutes = Number(v))}
								>
									<Select.Trigger class="h-tap w-48 text-base" aria-label="Password hold">
										{draft.elevationMinutes === 0
											? 'Every time'
											: `${draft.elevationMinutes} minute${draft.elevationMinutes === 1 ? '' : 's'}`}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="0" label="Every time">Every time</Select.Item>
										<Select.Item value="1" label="1 minute">1 minute</Select.Item>
										<Select.Item value="2" label="2 minutes">2 minutes</Select.Item>
										<Select.Item value="5" label="5 minutes">5 minutes</Select.Item>
									</Select.Content>
								</Select.Root>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Restart app"
							description="Reloads the kiosk without touching the device."
						>
							{#snippet control()}
								<Button variant="outline" size="lg" class="h-tap px-5 text-base" onclick={() => location.reload()}>
									<RotateCcw class="size-4" aria-hidden="true" /> Restart
								</Button>
							{/snippet}
						</SettingRow>
					{:else if active === 'input'}
						<!-- Input, camera options, volume and the test tone live in the quick panel
							 now: they are flipped mid-event and need no password. What is left here
							 is the configuration you set once. -->
						<SettingRow
							label="On-camera guide"
							description="The “Show your QR code here” pointer over the camera feed."
						>
							{#snippet control()}
								<Select.Root
									type="single"
									value={draft.cameraGuidePosition}
									onValueChange={(v) =>
										(draft.cameraGuidePosition = v as 'top' | 'bottom' | 'off')}
								>
									<Select.Trigger class="h-tap w-44 text-base" aria-label="On-camera guide">
										{draft.cameraGuidePosition === 'off'
											? 'Hidden'
											: draft.cameraGuidePosition === 'top'
												? 'Top of feed'
												: 'Bottom of feed'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="top" label="Top of feed">Top of feed</Select.Item>
										<Select.Item value="bottom" label="Bottom of feed">Bottom of feed</Select.Item>
										<Select.Item value="off" label="Hidden">Hidden</Select.Item>
									</Select.Content>
								</Select.Root>
							{/snippet}
						</SettingRow>

						{#if draft.cameraGuidePosition !== 'off'}
							<SettingRow
								label="Show the guide after"
								description="Seconds of no scanning before it appears. 0 keeps it on screen."
							>
								{#snippet control()}
									<Input
										type="number"
										min="0"
										max="120"
										bind:value={draft.cameraGuideIdleTime}
										class="h-tap w-24 text-base tabular-nums"
										aria-label="Guide idle seconds"
									/>
									<span class="text-sm text-muted-foreground">sec</span>
								{/snippet}
							</SettingRow>
						{/if}

						<SettingRow
							label="Ignore repeat scans for"
							description="Stops a scanner that fires twice from logging a duplicate."
						>
							{#snippet control()}
								<Input
									type="number"
									min="0"
									max="60"
									bind:value={draft.debounceSeconds}
									class="h-tap w-24 text-base tabular-nums"
									aria-label="Repeat scan window in seconds"
								/>
								<span class="text-sm text-muted-foreground">sec</span>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Time format"
							description="This device only. The web app keeps its own setting the same way."
						>
							{#snippet control()}
								<Select.Root
									type="single"
									bind:value={draft.timeFormat}
									onValueChange={(v) => (draft.timeFormat = v as '12h' | '24h')}
								>
									<Select.Trigger class="h-tap w-44 text-base" aria-label="Time format">
										{draft.timeFormat === '24h' ? '24-hour' : '12-hour'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="24h" label="24-hour">24-hour</Select.Item>
										<Select.Item value="12h" label="12-hour">12-hour</Select.Item>
									</Select.Content>
								</Select.Root>
							{/snippet}
						</SettingRow>

					{:else if active === 'event'}
						<SettingRow
							label="Which event this device scans for"
							description="A gate device sometimes has to stay on one event even when two overlap."
						>
							{#snippet control()}
								<Select.Root type="single" value={pinnedValue} onValueChange={setPinned}>
									<Select.Trigger class="h-tap w-64 text-base" aria-label="Event to scan for">
										{pinnedLabel}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="auto" label="Follow whichever is ongoing">
											Follow whichever is ongoing
										</Select.Item>
										{#each events as event (event.event_id)}
											<Select.Item value={String(event.event_id)} label={event.event_name}>
												{event.event_name}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							{/snippet}
						</SettingRow>
					{:else if active === 'sync'}
						<SettingRow label="Connection">
							{#snippet control()}
								<span
									class="text-base font-medium {kiosk.connected
										? 'text-primary'
										: 'text-kiosk-offline'}"
								>
									{kiosk.connected ? 'Online' : 'Offline'}
								</span>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Waiting to sync"
							description={kiosk.queued > 0
								? 'These scans are saved on this device and have not reached the server.'
								: 'Every scan has reached the server.'}
						>
							{#snippet control()}
								<span class="text-base font-medium tabular-nums">{kiosk.queued}</span>
								<Button
									onclick={() => {
										kiosk.flushQueue();
										lastSync = new Date();
									}}
									disabled={kiosk.queued === 0 || !kiosk.connected}
								>
									<RefreshCw class="size-4" aria-hidden="true" /> Retry now
								</Button>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="View queued scans"
							description="Exactly which check-ins are still on this device."
						>
							{#snippet control()}
								<Button
									variant="outline"
									size="lg"
									class="h-tap px-5 text-base"
									disabled={kiosk.queued === 0}
									onclick={() => (showQueue = !showQueue)}
								>
									{showQueue ? 'Hide' : 'Show'}
								</Button>
							{/snippet}
						</SettingRow>

						{#if showQueue && pending.length > 0}
							<!-- Oldest first, the order they will be sent in - so what is listed top to
								 bottom is what the server will see first to last. -->
							<ul class="space-y-2 py-4">
								{#each pending as scan, i (scan.code + scan.at)}
									<li
										class="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
									>
										<span
											class="w-7 shrink-0 text-sm text-muted-foreground tabular-nums"
											aria-hidden="true"
										>
											{i + 1}
										</span>
										<span class="min-w-0 flex-1">
											<span class="block truncate font-mono text-base font-medium">
												{scan.code}
											</span>
											<span class="block truncate text-sm text-muted-foreground">
												{scan.eventName ?? `Event ${scan.eventId}`}
											</span>
										</span>
										<span class="shrink-0 text-base text-muted-foreground tabular-nums">
											{formatClock(new Date(scan.at), kiosk.settings.timeFormat, true)}
										</span>
									</li>
								{/each}
							</ul>
						{/if}

						<SettingRow label="Last successful sync">
							{#snippet control()}
								<span class="text-base text-muted-foreground tabular-nums">
									{formatClock(lastSync, kiosk.settings.timeFormat, true)}
								</span>
							{/snippet}
						</SettingRow>
					{:else if active === 'account'}
						<!--
							Stacked rather than a SettingRow, because this is a value and not a control.
							SettingRow pins its control slot to `shrink-0` - correct for a button, fatal
							for a paired device's address, which is a UUID at a Supabase hostname with no
							break opportunity in it: it refused to shrink, overflowed the panel, and
							crushed the label column to one word per line.

							The address is also not worth reading. A paired device is identified by the
							name on its door, so that is what this shows; a person's account, signed in
							through Switch account, shows the actual email because then it matters who
							scans are being recorded as.
						-->
						<div class="min-h-tap py-3">
							<p class="text-base font-medium">Signed in as</p>
							{#if !kiosk.identity}
								<p class="mt-1 text-base font-medium">Not signed in</p>
								<p class="mt-0.5 text-sm leading-snug text-muted-foreground">
									This device records nothing until it is paired again.
								</p>
							{:else if kiosk.identity.email.startsWith('kiosk+')}
								<p class="mt-1 text-base font-medium">{kiosk.settings.deviceName}</p>
								<p class="mt-0.5 text-sm leading-snug text-muted-foreground">
									This device has its own identity, used by no person. Revoking it in the web
									app affects nothing else.
								</p>
							{:else}
								<p class="mt-1 text-base font-medium break-all">{kiosk.identity.email}</p>
								<p class="mt-0.5 text-sm leading-snug text-muted-foreground">
									Scans are recorded as this person until the device is signed out.
								</p>
							{/if}
							{#if kiosk.identity && !kiosk.identity.role}
								<!-- Signed in but unable to scan. Said plainly, because every scan will
									 fail and nothing else on this screen would explain why. -->
								<p class="mt-1 text-sm leading-snug font-medium text-destructive">
									No role assigned — this device cannot record scans.
								</p>
							{/if}
						</div>

						<SettingRow
							label="Sign in as a different account"
							description="For when the kiosk account is locked out. The screen stays a kiosk either way."
						>
							{#snippet control()}
								<Button variant="outline" size="lg" class="h-tap px-5 text-base" onclick={() => (switchOpen = true)}>
									<LogIn class="size-4" aria-hidden="true" /> Switch account
								</Button>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Sign out this device"
							description={signOutArmed
								? 'This device will need a new pairing code. Queued scans are kept and sent when it signs in again.'
								: 'Unbinds this kiosk. It stops recording attendance until it is paired again.'}
						>
							{#snippet control()}
								<Button
									variant="destructive"
									class="h-tap px-5 text-base"
									disabled={signingOut}
									onclick={async () => {
										// Two presses, like Back with unsaved changes: a single stray tap
										// should not take a door device offline mid-event.
										if (!signOutArmed) {
											signOutArmed = true;
											setTimeout(() => (signOutArmed = false), 5000);
											return;
										}
										signingOut = true;
										await kiosk.signOutDevice();
										signingOut = false;
									}}
								>
									<LogOut class="size-4" aria-hidden="true" />
									{signingOut ? 'Signing out…' : signOutArmed ? 'Press again to confirm' : 'Sign out'}
								</Button>
							{/snippet}
						</SettingRow>

						<!--
							Was a button with no handler at all. It now does what it says: drops
							fullscreen so the desktop is reachable. It does not quit the app -
							see `exitKioskMode`.
						-->
						<SettingRow
							label="Exit kiosk mode"
							description="Leaves fullscreen so the desktop is reachable. The app keeps running and stays signed in."
						>
							{#snippet control()}
								<Button
									variant="destructive"
									size="lg"
									class="h-tap px-5 text-base"
									disabled={!kiosk.shell}
									onclick={() => void kiosk.exitKioskMode()}
								>
									Exit kiosk
								</Button>
							{/snippet}
						</SettingRow>
					{:else if active === 'dev'}
						<!-- Android's own affordance: the switch that turns developer options back
							 off. Flipping it hides this section and clears the test flags with it,
							 so a kiosk is never left bypassed by a half-finished debugging session. -->
						<SettingRow
							label="Use developer options"
							description="Turn this off to hide these tools again. Unlock by tapping the version in About seven times."
						>
							{#snippet control()}
								<Switch
									class="scale-150"
									checked={dev.unlocked}
									onCheckedChange={(v) => {
										if (!v) {
											kiosk.exitDeveloperMode();
											active = 'about';
										}
									}}
									aria-label="Use developer options"
								/>
							{/snippet}
						</SettingRow>

						<!-- Mirrors the web app's "Testing & Validation" card. -->
						<SettingRow
							label="Bypass event time validation"
							description="Scan with no live event. Results are mocked — nothing reaches the database."
						>
							{#snippet control()}
								<Switch
									class="scale-150"
									checked={dev.bypass}
									onCheckedChange={(v) => kiosk.setBypass(v)}
									aria-label="Bypass event time validation"
								/>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Simulate offline"
							description="Forces the offline path so the queue can be exercised without unplugging."
						>
							{#snippet control()}
								<Switch
									class="scale-150"
									checked={dev.forceOffline}
									onCheckedChange={(v) => kiosk.setForceOffline(v)}
									aria-label="Simulate offline"
								/>
							{/snippet}
						</SettingRow>

						<!--
							These close Settings and count down before firing, because the result card
							renders on the scan screen - which this one replaces. Pressed from here they
							used to do nothing visible at all: the card appeared and timed out behind
							this panel. The floating dev button is the better home for them; this stays
							so the control someone already knows about does what it says.
						-->
						<SettingRow
							label="Preview a result"
							description="Closes Settings, waits three seconds, then shows the card at full size."
						>
							{#snippet control()}
								<div class="flex flex-wrap justify-end gap-2">
									<Button variant="outline" class="h-tap px-4 text-base" onclick={() => kiosk.armPreview(() => kiosk.previewResult('success'))}>
										Success
									</Button>
									<Button variant="outline" class="h-tap px-4 text-base" onclick={() => kiosk.armPreview(() => kiosk.previewResult('duplicate'))}>
										Duplicate
									</Button>
									<Button variant="outline" class="h-tap px-4 text-base" onclick={() => kiosk.armPreview(() => kiosk.previewResult('rejected'))}>
										Rejected
									</Button>
									<Button variant="outline" class="h-tap px-4 text-base" onclick={() => kiosk.armPreview(() => kiosk.previewResult('queued'))}>
										Queued
									</Button>
								</div>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Preview the event sequence"
							description="Walks nothing scheduled → up next → starting now → scanning, about 15s. Real events are suspended and restored; scans are refused while it runs."
						>
							{#snippet control()}
								<Button
									variant="outline"
									class="h-tap px-4 text-base"
									disabled={kiosk.previewingEvents}
									onclick={() => kiosk.armPreview(() => void kiosk.previewEventSequence())}
								>
									{kiosk.previewingEvents ? 'Running…' : 'Run'}
								</Button>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Floating dev button"
							description="With developer options on, a draggable bug button sits over the scan screen. Its panel opens beside it rather than over the screen, so previews can be watched while the controls stay reachable."
						></SettingRow>

						<SettingRow
							label="Last error"
							description="The most recent failure talking to Supabase."
						>
							{#snippet control()}
								<span class="max-w-sm text-right text-sm text-muted-foreground">
									{kiosk.lastError ?? 'None since start-up'}
								</span>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Native shell"
							description="Whether fullscreen and start-on-boot can actually be applied."
						>
							{#snippet control()}
								<span class="text-base text-muted-foreground">
									{kiosk.shell ? 'Tauri' : 'Browser — shell features unavailable'}
								</span>
							{/snippet}
						</SettingRow>

						<SettingRow label="Supabase">
							{#snippet control()}
								<span class="text-base text-muted-foreground">
									{kiosk.identity ? 'Connected' : 'Not signed in'}
								</span>
							{/snippet}
						</SettingRow>

						<SettingRow
							label="Session storage"
							description="Where this device keeps the token that keeps it signed in."
						>
							{#snippet control()}
								<span class="text-base text-muted-foreground">
									{usingKeyring ? 'OS credential store' : 'Browser storage'}
								</span>
							{/snippet}
						</SettingRow>

						<!-- Mirrors the web app's "Database Maintenance" card: destructive, so it is
							 separated from the toggles above and says exactly what it discards. -->
						<SettingRow
							label="Discard queued scans"
							description="Deletes the {kiosk.queued} pending check-in{kiosk.queued === 1 ? '' : 's'} on this device. They are not sent."
						>
							{#snippet control()}
								<Button
									variant="destructive"
									class="h-tap px-5 text-base"
									disabled={kiosk.queued === 0}
									onclick={() => kiosk.discardQueue()}
								>
									<Trash2 class="size-4" aria-hidden="true" /> Discard
								</Button>
							{/snippet}
						</SettingRow>
					{:else}
						<!-- About is identity and provenance - whose system this is, which device,
							 what version. The connection and storage details that used to live here
							 are diagnostics; they moved to Developer Tools. -->
						<SettingRow label="Organisation">
							{#snippet control()}
								<span class="text-base text-muted-foreground">{kiosk.shared.orgName}</span>
							{/snippet}
						</SettingRow>
						<SettingRow label="System">
							{#snippet control()}
								<span class="text-base text-muted-foreground">{kiosk.shared.siteName}</span>
							{/snippet}
						</SettingRow>
						<SettingRow label="This device">
							{#snippet control()}
								<span class="text-base text-muted-foreground">{kiosk.settings.deviceName}</span>
							{/snippet}
						</SettingRow>

						<!-- The Android gesture: seven taps here turns on Developer Tools. -->
						<SettingRow label="Kiosk version" description={tapMessage ?? undefined}>
							{#snippet control()}
								<button
									type="button"
									onclick={tapVersion}
									class="h-tap rounded-lg px-4 text-base text-muted-foreground tabular-nums
										transition-colors hover:bg-accent focus-visible:ring-2
										focus-visible:ring-ring focus-visible:outline-none"
								>
									{APP_VERSION}
								</button>
							{/snippet}
						</SettingRow>

						<SettingRow label="Runtime">
							{#snippet control()}
								<span class="text-base text-muted-foreground">
									{kiosk.shell ? 'Tauri' : 'Browser'} · {platform}
								</span>
							{/snippet}
						</SettingRow>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Floating save, same shape as the web app's App Settings bar: it only exists while there
	 is something to save, so a kiosk at rest has no button inviting a tap.

	 When Back has been pressed with unsaved changes it turns into the warning instead - the
	 message lands where the save button already is, rather than in a modal nobody at a door
	 wants to dismiss. Pressing Back again leaves and discards. -->
{#if kiosk.dirty}
	<div
		transition:fly={{ y: 24, duration: 250 }}
		class="fixed right-6 bottom-6 z-50 flex items-center gap-4 rounded-full border bg-card
			p-2 pl-5 shadow-lg shadow-black/20
			{kiosk.backArmed ? 'border-amber-500/50' : 'border-border/50'}"
		role="status"
		aria-live="polite"
	>
		{#if kiosk.backArmed}
			<span class="flex items-center gap-2 text-sm font-medium text-amber-600">
				<TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
				Unsaved — press Back again to discard
			</span>
		{:else}
			<span class="text-sm font-medium text-muted-foreground">Unsaved changes</span>
		{/if}
		<Button class="h-tap rounded-full px-7 text-base" disabled={saving} onclick={save}>
			<Save class="size-4" aria-hidden="true" />
			{saving ? 'Saving…' : 'Save changes'}
		</Button>
	</div>
{:else if justSaved}
	<div
		transition:fly={{ y: 24, duration: 250 }}
		class="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border
			border-stat-success/40 bg-card px-5 py-3 text-sm font-medium text-stat-success
			shadow-lg shadow-black/20"
		role="status"
		aria-live="polite"
	>
		<Check class="size-4" aria-hidden="true" />
		Saved on this device
	</div>
{/if}

<!-- Returns to the scan screen on success: the escape hatch changes who scans are recorded
	 as, never what the device shows. -->
<SwitchAccountDialog bind:open={switchOpen} ondone={() => kiosk.requestBack()} />

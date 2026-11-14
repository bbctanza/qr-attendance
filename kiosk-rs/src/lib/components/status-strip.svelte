<script lang="ts">
	import { kiosk } from '$lib/kiosk/state.svelte';
	import { formatClock } from '$lib/kiosk/format';
	import { Wifi, WifiOff, Inbox, QrCode, ArrowLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { dev } from '$lib/kiosk/dev.svelte';

	const clock = $derived(formatClock(kiosk.now, kiosk.settings.timeFormat));
	const inSettings = $derived(kiosk.screen === 'settings');
</script>

<!-- Offline turns the whole strip, not an 8px dot. Nobody is watching this device closely;
	 the failure has to be visible from wherever staff are standing. -->
<header
	class="flex shrink-0 items-center gap-4 border-b px-6 py-3 transition-colors duration-300
		{kiosk.connected ? 'border-border bg-card' : 'border-destructive/40 bg-destructive/15'}"
>
	<!-- This is the only header the app has. Settings used to add a second one below it, which
		 repeated the branding and spent a whole row on a title and one button; the strip just
		 changes instead. -->
	{#if inSettings}
		<Button
			variant="ghost"
			size="icon"
			class="size-[44px] shrink-0"
			onclick={() => kiosk.requestBack()}
			aria-label="Back to scanning"
		>
			<ArrowLeft class="size-6" />
		</Button>
	{:else}
		<!-- The system's actual mark, not a lookalike: static/favicon.svg is Lucide's `qr-code`
			 glyph, so the same icon is used here rather than an <img> fetch - it inherits the
			 theme's colour and stays crisp at any size. The chip is the web app's kiosk standby
			 badge, same 34px box and 9px radius. -->
		<div
			class="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-primary
				text-primary-foreground"
			aria-hidden="true"
		>
			<QrCode class="size-5" strokeWidth={2.25} />
		</div>
	{/if}

	<!-- Organisation first, system name under it. Both come from the web app's
		 system_settings row (qr_header_title / site_name), so renaming in App Settings
		 renames every kiosk. In settings the subtitle says where you are instead. -->
	<div class="min-w-0 flex-1">
		<h1 class="truncate text-sm font-semibold tracking-tight">
			{kiosk.shared.orgName}
		</h1>
		<p class="truncate text-xs text-muted-foreground">
			{inSettings ? 'Kiosk settings' : kiosk.shared.siteName}
		</p>
	</div>

	<!-- Test mode has to be unmissable. A kiosk left bypassed would take a whole event's
		 attendance and record none of it, and the only clue would be buried in a settings
		 panel nobody opens mid-event. -->
	{#if dev.bypass}
		<span
			class="flex shrink-0 items-center gap-2 rounded-md border border-amber-500/50
				bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-600"
		>
			TEST MODE — scans are not saved
		</span>
	{/if}

	{#if kiosk.queued > 0}
		<button
			type="button"
			onclick={() => (kiosk.screen = 'settings')}
			class="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15
				px-3 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/25
				focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<Inbox class="size-4" aria-hidden="true" />
			{kiosk.queued} waiting to sync
		</button>
	{/if}

	<!-- The icon already says online/offline, so the word would only repeat it. The device
		 name takes that space instead: with several kiosks at different doors, "which machine
		 am I standing at" is the question this row can actually answer. -->
	<div
		class="flex min-w-0 items-center gap-2 text-sm font-medium
			{kiosk.connected ? 'text-muted-foreground' : 'text-destructive'}"
	>
		{#if kiosk.connected}
			<Wifi class="size-4 shrink-0" aria-hidden="true" />
		{:else}
			<WifiOff class="size-4 shrink-0" aria-hidden="true" />
		{/if}
		<span class="truncate">{kiosk.settings.deviceName}</span>
		<span class="sr-only">{kiosk.connected ? 'Online' : 'Offline'}</span>
	</div>

	<time class="text-lg font-semibold tabular-nums" datetime={kiosk.now.toISOString()}>
		{clock}
	</time>
</header>

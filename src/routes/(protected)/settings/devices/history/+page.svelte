<script lang="ts">
	import { onMount } from 'svelte';
	import { siteConfig } from '$lib/config/site';
	import PageShell from '$lib/components/page-shell.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { MonitorSmartphone, KeyRound } from '@lucide/svelte';
	import {
		devicesApi,
		codeState,
		type KioskDevice,
		type PairingCode,
		type CodeState
	} from '$lib/api/devices';

	/**
	 * Pairing history — every code ever issued, and every device that has been revoked.
	 *
	 * Separate from the Devices page on purpose: that page answers "what is running right
	 * now", and mixing spent codes and dead devices into it buries the one list someone
	 * actually needs mid-event. This page answers "what happened", which is a different
	 * question asked at a different time.
	 */
	let codes = $state<PairingCode[]>([]);
	let revoked = $state<KioskDevice[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	async function load() {
		loading = true;
		loadError = null;
		try {
			const [allCodes, allDevices] = await Promise.all([
				devicesApi.listCodes(),
				devicesApi.list()
			]);
			codes = allCodes;
			revoked = allDevices.filter((d) => d.status === 'revoked');
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Could not load history.';
		}
		loading = false;
	}

	onMount(load);

	const LABELS: Record<CodeState, string> = {
		paired: 'Paired',
		waiting: 'Not used yet',
		expired: 'Expired'
	};

	function when(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}
</script>

<svelte:head>
	<title>Pairing History | {siteConfig.name}</title>
</svelte:head>

<PageShell
	title="Pairing History"
	description="Every pairing code issued, and kiosks that have been revoked."
	backTo="/settings/devices"
	isLoading={loading}
	error={loadError}
	onRetry={load}
>
	<div class="space-y-6">
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<KeyRound class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Pairing codes</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				{#if codes.length === 0}
					<p class="py-6 text-center text-sm text-muted-foreground">
						No pairing codes have been issued yet.
					</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each codes as code (code.code)}
							{@const state = codeState(code)}
							<li class="flex flex-wrap items-center justify-between gap-3 py-3">
								<div class="min-w-0">
									<!-- The code itself stays readable: it is single-use and, once it is
										 on this page, already spent or dead. -->
									<p class="font-mono text-sm font-semibold">{code.code}</p>
									<p class="text-xs text-muted-foreground">
										Issued {when(code.created_at)}
										{#if code.created_by_email}
											· {code.created_by_email}
										{/if}
									</p>
								</div>
								<Badge
									variant={state === 'paired'
										? 'secondary'
										: state === 'waiting'
											? 'outline'
											: 'destructive'}
								>
									{LABELS[state]}
								</Badge>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<MonitorSmartphone class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Revoked kiosks</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				{#if revoked.length === 0}
					<p class="py-6 text-center text-sm text-muted-foreground">
						No kiosks have been revoked.
					</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each revoked as device (device.id)}
							<li class="flex flex-wrap items-center justify-between gap-3 py-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold">{device.name}</p>
									<p class="text-xs text-muted-foreground">
										Paired {when(device.paired_at)}
										{#if device.revoked_at}
											· revoked {when(device.revoked_at)}
										{/if}
									</p>
								</div>
								<Badge variant="destructive">Revoked</Badge>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>
	</div>
</PageShell>

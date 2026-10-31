<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { LogOut, Monitor, Smartphone, Tablet } from '@lucide/svelte';
	import { formatLastActive, type UserSession } from '$lib/utils/sessions';

	/**
	 * Presentational list of active sessions.
	 *
	 * State and data loading live in the parent so that the mobile and desktop layouts render
	 * the same rows from one source rather than each keeping their own copy (and their own
	 * realtime subscription).
	 */
	let {
		sessions = [],
		isLoading = false,
		pendingId = null,
		isRevokingAll = false,
		onRevoke,
		onRevokeAll
	}: {
		sessions: UserSession[];
		isLoading: boolean;
		pendingId: string | null;
		isRevokingAll: boolean;
		onRevoke: (session: UserSession) => void;
		onRevokeAll: () => void;
	} = $props();

	let otherCount = $derived(sessions.filter((s) => !s.is_current).length);

	function deviceIcon(name: string) {
		if (/iPhone|Android/i.test(name)) return Smartphone;
		if (/iPad|Tablet/i.test(name)) return Tablet;
		return Monitor;
	}
</script>

{#if isLoading}
	<div class="space-y-3">
		{#each [1, 2] as i (i)}
			<div class="flex items-start gap-3 rounded-lg border border-border/20 p-3">
				<Skeleton class="h-8 w-8 rounded-md" />
				<div class="flex-1 space-y-2">
					<Skeleton class="h-4 w-32" />
					<Skeleton class="h-3 w-24" />
					<Skeleton class="h-3 w-40" />
				</div>
			</div>
		{/each}
	</div>
{:else if sessions.length === 0}
	<p class="py-6 text-center text-xs text-muted-foreground">
		No active sessions found. Sign in again to start tracking this device.
	</p>
{:else}
	<div class="space-y-3">
		{#each sessions as session (session.id)}
			{@const Icon = deviceIcon(session.device_name)}
			<div
				class="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors {session.is_current
					? 'border-primary/30 bg-primary/5'
					: 'border-border/20 bg-card/50'}"
			>
				<div class="flex min-w-0 flex-1 items-start gap-3">
					<div class="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
						<Icon class="h-4 w-4" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="truncate text-sm font-medium">{session.device_name}</span>
							{#if session.is_current}
								<Badge class="text-xs">This device</Badge>
							{/if}
						</div>
						<p class="mt-1 truncate text-xs text-muted-foreground">{session.browser}</p>
						<p class="truncate text-xs text-muted-foreground">{session.location}</p>
						<p class="text-xs text-muted-foreground">
							Last active: {formatLastActive(session.last_active)}
						</p>
					</div>
				</div>

				{#if !session.is_current}
					<button
						onclick={() => onRevoke(session)}
						disabled={pendingId === session.id || isRevokingAll}
						title="Sign out this device"
						aria-label="Sign out {session.device_name}"
						class="shrink-0 rounded-md p-2 text-muted-foreground transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if pendingId === session.id}
							<Spinner class="h-4 w-4" />
						{:else}
							<LogOut class="h-4 w-4" />
						{/if}
					</button>
				{/if}
			</div>
		{/each}

		{#if otherCount > 0}
			<Button
				variant="outline"
				size="sm"
				class="w-full text-xs text-red-500 hover:text-red-600"
				disabled={isRevokingAll || pendingId !== null}
				onclick={onRevokeAll}
			>
				{#if isRevokingAll}
					<Spinner class="mr-2 h-3 w-3" />
					Signing out...
				{:else}
					Log out all other devices ({otherCount})
				{/if}
			</Button>
		{/if}
	</div>
{/if}

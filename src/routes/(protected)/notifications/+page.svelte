<script lang="ts">
	import { notifications, unreadCount } from '$lib/stores/notifications';
	import { Button } from '$lib/components/ui/button';
	import {
		Bell,
		Check,
		Trash2,
		Info,
		AlertTriangle,
		CheckCircle,
		AlertCircle,
		ArrowLeft,
		X
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { formatLocalTime } from '$lib/utils/time';

	function formatDate(iso: string) {
		try {
			const date = new Date(iso);
			const now = new Date();
			const diff = now.getTime() - date.getTime();

			// If less than 24 hours
			if (diff < 86400000) {
				// Approximate time ago
				if (diff < 60000) return 'Just now';
				if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
				return `${Math.floor(diff / 3600000)}h ago`;
			}
			return date.toLocaleDateString();
		} catch (e) {
			return 'Recently';
		}
	}
</script>

<div class="flex min-h-screen flex-col bg-background pb-20 md:pb-0">
	<!-- Header Actions -->
	<div
		class="sticky top-0 z-10 flex items-center justify-between border-b border-border/40 bg-card/10 px-5 py-5 backdrop-blur-sm"
	>
		<div class="flex flex-col">
			<h1 class="text-xl font-black tracking-tight text-primary uppercase italic">Inbox</h1>
			<div class="mt-0.5 flex items-center gap-2">
				<span class="text-[10px] font-black tracking-widest text-muted-foreground uppercase"
					>Activity</span
				>
				{#if $unreadCount > 0}
					<div class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></div>
					<span class="text-[10px] font-bold text-primary uppercase">{$unreadCount} New</span>
				{/if}
			</div>
		</div>
		<div class="flex gap-2">
			{#if $unreadCount > 0}
				<Button
					variant="ghost"
					size="sm"
					class="h-9 rounded-xl px-3 text-[10px] font-black tracking-widest uppercase transition-all hover:bg-primary/5 hover:text-primary"
					onclick={() => notifications.markAllAsRead()}
				>
					<Check class="mr-1.5 h-3.5 w-3.5" /> Mark read
				</Button>
			{/if}
			{#if $notifications.length > 0}
				<Button
					variant="ghost"
					size="icon"
					class="h-9 w-9 rounded-xl text-muted-foreground transition-all hover:bg-destructive/5 hover:text-destructive"
					onclick={() => notifications.clear()}
					title="Clear all"
				>
					<Trash2 class="h-4 w-4" />
				</Button>
			{/if}
		</div>
	</div>

	<!-- Notification List -->
	<div class="flex-1 space-y-4 px-4 py-6">
		{#if $notifications.length === 0}
			<div class="flex flex-col items-center justify-center py-32 text-center">
				<div class="mb-6 rounded-full bg-muted/20 p-6">
					<Bell class="h-10 w-10 text-muted-foreground/40" />
				</div>
				<h3 class="text-xl font-bold tracking-tight">Zero alerts</h3>
				<p class="mt-1 max-w-50 text-sm text-muted-foreground">
					We'll let you know when something important happens.
				</p>
			</div>
		{:else}
			{#each $notifications as note (note.id)}
				<div class="group relative">
					<button
						class="flex w-full gap-4 rounded-2xl border border-border/40 bg-card/30 p-4 text-left transition-all active:scale-[0.98] {note.read
							? 'opacity-60 grayscale-[0.3]'
							: 'shadow-lg ring-1 shadow-primary/5 ring-primary/5 hover:bg-card/50'}"
						onclick={() => notifications.markAsRead(note.id)}
					>
						<div class="mt-1 shrink-0">
							{#if note.type === 'success'}
								<div class="rounded-2xl bg-primary/10 p-3 text-primary">
									<CheckCircle class="h-5 w-5" />
								</div>
							{:else if note.type === 'warning'}
								<div class="rounded-2xl bg-amber-500/10 p-3 text-amber-500">
									<AlertTriangle class="h-5 w-5" />
								</div>
							{:else if note.type === 'error'}
								<div class="rounded-2xl bg-destructive/10 p-3 text-destructive">
									<AlertCircle class="h-5 w-5" />
								</div>
							{:else}
								<div class="rounded-2xl bg-blue-500/10 p-3 text-blue-500">
									<Info class="h-5 w-5" />
								</div>
							{/if}
						</div>
						<div class="min-w-0 flex-1 pr-4">
							<div class="mb-0.5 flex items-center justify-between">
								<h4
									class="text-sm font-bold tracking-tight {note.read
										? 'text-muted-foreground'
										: 'text-foreground'}"
								>
									{note.title}
								</h4>
								<span class="text-[10px] font-semibold text-muted-foreground uppercase opacity-60"
									>{formatDate(note.timestamp)}</span
								>
							</div>
							<p
								class="text-xs leading-relaxed text-muted-foreground {note.read
									? ''
									: 'text-foreground/80'}"
							>
								{note.message}
							</p>
						</div>

						{#if !note.read}
							<div class="absolute top-1/2 right-4 -translate-y-1/2">
								<div
									class="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]"
								></div>
							</div>
						{/if}
					</button>

					<button
						onclick={(e) => {
							e.stopPropagation();
							notifications.remove(note.id);
						}}
						class="hover:text-destructive-foreground absolute -top-1 -right-1 z-20 rounded-full border border-border/60 bg-background p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
					>
						<Trash2 class="h-3 w-3" />
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>

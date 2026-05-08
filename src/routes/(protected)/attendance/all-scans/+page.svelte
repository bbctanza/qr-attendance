<script lang="ts">
	import { Search, ScanLine, X } from '@lucide/svelte';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Input } from '$lib/components/ui/input';
	import {
		Card,
		CardHeader,
		CardContent,
		CardTitle,
		CardDescription
	} from '$lib/components/ui/card';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { page } from '$app/stores';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatLocalTime } from '$lib/utils/time';

	let allScans = $state<any[]>([]);
	let isLoading = $state(true);
	let searchQuery = $state('');
	let currentEventId = $state<string | null>(null);

	onMount(async () => {
		// Get current event ID
		const { data: currentEvent } = await supabase
			.from('events')
			.select('event_id')
			.eq('status', 'ongoing')
			.limit(1)
			.maybeSingle();

		if (currentEvent) {
			currentEventId = currentEvent.event_id;
			await fetchAllScans(currentEvent.event_id);
		}

		isLoading = false;
	});

	async function fetchAllScans(eventId: string) {
		const { data } = await supabase
			.from('attendance_scans')
			.select('*, members(*)')
			.eq('event_id', eventId)
			.order('scan_datetime', { ascending: false });

		if (data) {
			allScans = await Promise.all(
				data.map(async (s) => ({
					id: s.scan_id,
					name: s.members ? `${s.members.first_name} ${s.members.last_name}` : 'Unknown Member',
					role: s.members?.metadata?.role || 'Member',
					time: await formatLocalTime(s.scan_datetime),
					avatar: s.members
						? `https://api.dicebear.com/7.x/initials/svg?seed=${s.members.first_name}%20${s.members.last_name}`
						: 'https://api.dicebear.com/7.x/initials/svg?seed=U'
				}))
			);
		}
	}

	let filteredScans = $derived(
		allScans.filter(
			(scan) =>
				scan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				scan.role.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);
</script>

{#if isLoading}
	<div class="flex h-full flex-col gap-6 p-4 md:p-8">
		<Skeleton class="h-11 w-full rounded-md" />
		<div class="grid flex-1 gap-3 overflow-y-auto">
			{#each Array(8) as _}
				<div class="flex items-center justify-between rounded-lg border border-border/40 bg-card p-4 shadow-sm">
					<div class="flex min-w-0 items-center gap-3">
						<Skeleton class="h-12 w-12 rounded-full" />
						<div class="space-y-2">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-3 w-16" />
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Skeleton class="h-4 w-16" />
						<Skeleton class="h-2 w-2 rounded-full" />
					</div>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<div class="flex h-full flex-col gap-6 p-4 md:p-8">
		<!-- Search Input -->
		<div class="relative">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground"
			/>
			<Input
				type="text"
				placeholder="Search by name or role..."
				class="h-11 pl-10"
				bind:value={searchQuery}
			/>
		</div>

		<!-- Scans List -->
		<div class="grid flex-1 gap-3 overflow-y-auto">
			{#if filteredScans && filteredScans.length > 0}
				{#each filteredScans as scan (scan.id)}
					<div
						class="group flex items-center justify-between rounded-lg border border-border/40 bg-card p-4 shadow-sm transition-all hover:bg-muted/30 hover:shadow-md"
					>
						<div class="flex min-w-0 items-center gap-3">
							<Avatar class="h-12 w-12 flex-shrink-0 rounded-full">
								<AvatarImage src={scan.avatar} alt={scan.name} />
								<AvatarFallback>{scan.name?.charAt(0) || '?'}</AvatarFallback>
							</Avatar>
							<div class="min-w-0">
								<div class="truncate text-sm font-semibold sm:text-base">{scan.name}</div>
								<div class="text-xs text-muted-foreground">{scan.role}</div>
							</div>
						</div>
						<div
							class="ml-2 flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground sm:text-sm"
						>
							<span class="font-medium">{scan.time}</span>
							<span class="h-2 w-2 flex-shrink-0 rounded-full bg-green-500"></span>
						</div>
					</div>
				{/each}
			{:else}
				<div
					class="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground"
				>
					<ScanLine class="mb-2 h-12 w-12 opacity-30" />
					<p class="text-sm">
						{searchQuery ? 'No matching check-ins found.' : 'No check-ins yet.'}
					</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

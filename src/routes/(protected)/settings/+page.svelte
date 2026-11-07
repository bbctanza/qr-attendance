<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import PageShell from '$lib/components/page-shell.svelte';
	import SettingsTile from '$lib/components/settings-tile.svelte';
	import { Card } from '$lib/components/ui/card';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { goto } from '$app/navigation';
	import {
		Clock,
		Calendar,
		Users,
		Settings,
		LogOut,
		Info,
		UserPlus,
		ShieldAlert,
		Construction,
		Pencil,
		ChartNoAxesCombined
	} from '@lucide/svelte';
	import { supabase } from '$lib/supabase';
	import { endCurrentSession } from '$lib/utils/sessions';
	import { onMount } from 'svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import AboutModal from '$lib/components/about-modal.svelte';
	import ChangelogModal from '$lib/components/changelog-modal.svelte';
	import { CURRENT_VERSION } from '$lib/config/changelog';

	let user = $state({ name: 'User', role: 'Staff', avatar: '' });
	let isLoading = $state(true);
	let isAboutOpen = $state(false);
	let isChangelogOpen = $state(false);

	onMount(async () => {
		await fetchProfile();
	});

	async function fetchProfile() {
		isLoading = true;
		try {
			const {
				data: { user: authUser }
			} = await supabase.auth.getUser();
			if (authUser) {
				const { data: prof } = await supabase
					.from('profiles')
					.select('*')
					.eq('id', authUser.id)
					.single();

				if (prof) {
					user = {
						name: prof.full_name || authUser.user_metadata?.full_name || 'User',
						role: prof.role ? prof.role.charAt(0).toUpperCase() + prof.role.slice(1) : 'Staff',
						avatar: prof.avatar_url || authUser.user_metadata?.avatar_url || ''
					};
				} else {
					user = {
						name: authUser.user_metadata?.full_name || 'User',
						role: 'Staff',
						avatar: authUser.user_metadata?.avatar_url || ''
					};
				}
			}
		} catch (e) {
			console.error('Error fetching profile in settings:', e);
		} finally {
			isLoading = false;
		}
	}

	function open(path: string) {
		// navigate to route if provided
		if (path) goto(path);
	}

	async function handleLogout() {
		// Retire this device's session row before signing out (see app-sidebar).
		await endCurrentSession();
		const { error } = await supabase.auth.signOut();
		if (error) {
			console.error('Error logging out:', error);
		} else {
			goto('/');
		}
	}
</script>

<svelte:head>
	<title>Options | {siteConfig.name}</title>
</svelte:head>

<PageShell title="Options" description="Manage your profile and preferences" {isLoading}>
	{#snippet skeleton()}
		<!-- Header -->

		<!-- Profile Card -->
		<Card class="px-4 py-6 sm:px-6 sm:py-8">
			<div class="flex flex-row items-center justify-between gap-4">
				<div class="flex min-w-0 flex-1 items-center gap-4">
					<Skeleton class="h-16 w-16 rounded-full sm:h-20 sm:w-20" />
					<div class="space-y-2">
						<Skeleton class="h-6 w-32 sm:h-7" />
						<Skeleton class="h-5 w-16 rounded-full" />
					</div>
				</div>
				<Skeleton class="h-8 w-8 rounded-md" />
			</div>
		</Card>

		<!-- Sections Grid -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
			{#each Array(3) as _}
				<div>
					<Skeleton class="mb-4 h-4 w-32" />
					<div class="space-y-3 sm:space-y-4">
						{#each Array(3) as _}
							<div
								class="flex w-full items-center gap-4 rounded-2xl border border-border/20 bg-card/20 px-4 py-3 sm:px-6"
							>
								<Skeleton class="h-11 w-11 rounded-md" />
								<div class="flex-1 space-y-2">
									<Skeleton class="h-4 w-24 sm:w-32" />
									<Skeleton class="h-3 w-32 sm:w-48" />
								</div>
								<Skeleton class="h-4 w-4" />
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/snippet}

	<!-- Profile Card -->
	<Card class="px-4 py-6 sm:px-6 sm:py-8">
		<div class="flex flex-row items-center justify-between gap-4">
			<div class="flex min-w-0 flex-1 items-center gap-4">
				<Avatar class="h-16 w-16 shrink-0 sm:h-20 sm:w-20">
					{#if user.avatar}
						<AvatarImage src={user.avatar} alt={user.name} />
					{:else}
						<AvatarFallback
							>{user.name
								.split(' ')
								.map((n) => n[0])
								.join('')
								.substring(0, 2)}</AvatarFallback
						>
					{/if}
				</Avatar>
				<div class="min-w-0 flex-1">
					<div class="truncate text-lg font-bold sm:text-xl">{user.name}</div>
					<Badge class="mt-2">{user.role}</Badge>
				</div>
			</div>
			<button
				class="self-start p-2 text-muted-foreground transition-colors hover:text-foreground sm:self-auto"
				aria-label="Edit profile"
				onclick={() => open('/settings/profile')}
			>
				<Pencil class="h-5 w-5" />
			</button>
		</div>
	</Card>

	<!-- Sections Grid -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
		<!-- Tracking & Data Section -->
		<div>
			<h2 class="mb-4 text-sm font-semibold tracking-widest text-muted-foreground/60 uppercase">
				Tracking & Data
			</h2>
			<div class="space-y-3 sm:space-y-4">
				<SettingsTile
					href="/attendance/history"
					label="Attendance History"
					description="Review past check-ins"
					icon={Clock}
				/>
				<SettingsTile
					href="/analytics"
					label="Analytics"
					description="View attendance insights"
					icon={ChartNoAxesCombined}
				/>
				{#if user.role === 'Admin' || user.role === 'Developer'}
					<SettingsTile
						href="/settings/audit-logs"
						label="Audit Logs"
						description="Track changes & data"
						icon={ShieldAlert}
					/>
				{/if}
			</div>
		</div>

		<!-- Administration Section -->
		<div>
			<h2 class="mb-4 text-sm font-semibold tracking-widest text-muted-foreground/60 uppercase">
				Administration
			</h2>
			<div class="space-y-3 sm:space-y-4">
				<SettingsTile
					href="/events"
					label="Manage Events"
					description="Create and edit events"
					icon={Calendar}
				/>

				<SettingsTile
					href="/groups"
					label="Manage Groups"
					description="Organize members"
					icon={Users}
				/>

				{#if user.role === 'Admin' || user.role === 'Developer'}
					<SettingsTile
						href="/settings/access"
						label="Access Directory"
						description="Invites, roles & account access"
						icon={UserPlus}
					/>
				{/if}
			</div>
		</div>
	</div>

	<!-- System Section -->
	<div>
		<h2 class="mb-4 text-sm font-semibold tracking-widest text-muted-foreground/60 uppercase">
			System
		</h2>
		<div class="space-y-3 sm:space-y-4">
			<SettingsTile
				href="/settings/app"
				label="App Settings"
				description="Preferences & Notifications"
				icon={Settings}
			/>

			{#if user.role === 'Developer'}
				<SettingsTile
					href="/settings/dev"
					label="Developer Tools"
					description="Debug & test features"
					icon={Construction}
				/>
			{/if}

			<SettingsTile
				onclick={() => (isAboutOpen = true)}
				label="About"
				description="About this application"
				icon={Info}
			/>
		</div>
	</div>

	<!-- Footer -->
	<Separator class="my-4" />
	<div class="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
		<button
			class="text-sm font-bold text-red-500 transition-colors hover:text-red-600 sm:text-base"
			onclick={handleLogout}
		>
			<LogOut class="mr-2 inline h-4 w-4" />
			Log Out
		</button>
		<div class="text-center text-xs text-muted-foreground sm:text-right">
			QR Attendance System v{CURRENT_VERSION}
		</div>
	</div>
</PageShell>

<!-- About Modal -->
<AboutModal
	bind:open={isAboutOpen}
	onViewChangelog={() => {
		isAboutOpen = false;
		isChangelogOpen = true;
	}}
/>

<!-- Changelog Modal -->
<ChangelogModal bind:open={isChangelogOpen} />

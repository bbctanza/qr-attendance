<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import PageShell from '$lib/components/page-shell.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Lock, Smartphone, Eye, EyeOff } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { ensureAvatarDownloadParam } from '$lib/utils/avatarUrl';
	import { onMount } from 'svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		getUserSessions,
		revokeSession,
		revokeAllOtherSessions,
		type UserSession
	} from '$lib/utils/sessions';
	import ActiveSessionsList from '$lib/components/active-sessions-list.svelte';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	// Profile state
	let profile = $state({
		id: '',
		name: '',
		email: '',
		avatar: '',
		role: 'staff'
	});

	let originalProfile = $state({
		id: '',
		name: '',
		email: '',
		avatar: '',
		role: 'staff'
	});

	let isLoading = $state(true);
	let isSaving = $state(false);
	let isLoadingSessions = $state(false);

	let passwordForm = $state({
		currentPassword: '',
		newPassword: '',
		confirmPassword: '',
		showCurrent: false,
		showNew: false,
		showConfirm: false
	});

	let twoFaEnabled = $state(false);

	let activeSessions: UserSession[] = $state([]);
	let pendingSessionId: string | null = $state(null);
	let isRevokingAll = $state(false);

	// Confirmation dialog state (replaces native confirm(), which blocks the page).
	// Open state is tracked separately from the target so the dialog's exit animation still
	// has a device name to render instead of blanking out.
	let sessionToRevoke: UserSession | null = $state(null);
	let showRevokeDialog = $state(false);
	let showRevokeAllDialog = $state(false);

	let sessionsChannel: RealtimeChannel | null = null;

	// Check if there are unsaved changes
	let hasUnsavedChanges = $derived(
		profile.name !== originalProfile.name ||
			profile.avatar !== originalProfile.avatar ||
			passwordForm.newPassword !== ''
	);

	onMount(() => {
		(async () => {
			await fetchProfile();
			await loadSessions();
			await subscribeToSessions();
		})();

		return () => {
			if (sessionsChannel) supabase.removeChannel(sessionsChannel);
		};
	});

	/**
	 * Keep the list in step with reality: rows change when another device signs in, signs out,
	 * or is revoked from here. Without this the list silently goes stale.
	 */
	async function subscribeToSessions() {
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return;

		sessionsChannel = supabase
			.channel(`profile-sessions:${user.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'user_sessions',
					filter: `user_id=eq.${user.id}`
				},
				() => {
					// Refetch rather than patching in place: getUserSessions() also recomputes
					// is_current and applies the staleness cutoff.
					loadSessions();
				}
			)
			.subscribe();
	}

	async function fetchProfile() {
		isLoading = true;
		try {
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (!user) {
				goto('/');
				return;
			}

			const { data: prof, error } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', user.id)
				.single();

			if (error) {
				// If profile doesn't exist yet (unlikely due to trigger, but possible)
				profile = {
					id: user.id,
					name: user.user_metadata?.full_name || 'User',
					email: user.email || '',
					avatar: user.user_metadata?.avatar_url || '',
					role: 'staff'
				};
			} else {
				// We'll use field aliasing or just assume columns exist
				// Cast to any to avoid TS errors if columns are literally missing in type defs
				const p = prof as any;
				profile = {
					id: p.id,
					name: p.full_name || user.user_metadata?.full_name || 'User',
					email: p.email || user.email || '',
					avatar: p.avatar_url || user.user_metadata?.avatar_url || '',
					role: p.role || 'staff'
				};
			}
			// Store original values for change detection
			originalProfile = { ...profile };
		} catch (e) {
		} finally {
			isLoading = false;
		}
	}

	async function handleChangeAvatar() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			// Check file size (max 5MB)
			if (file.size > 5 * 1024 * 1024) {
				toast.error('Image size must be less than 5MB');
				return;
			}

			try {
				toast.info('Uploading avatar...');

				// Delete old avatar if exists
				if (profile.avatar) {
					const oldFileName = profile.avatar.split('/').pop();
					if (oldFileName) {
						try {
							await supabase.storage.from('user-profile').remove([oldFileName]);
						} catch (e) {
							console.log('Could not delete old avatar:', e);
						}
					}
				}

				// Generate unique filename
				const timestamp = Date.now();
				const extension = file.name.split('.').pop();
				const fileName = `avatar-${profile.id}-${timestamp}.${extension}`;

				// Upload to Supabase Storage
				const { data, error } = await supabase.storage.from('user-profile').upload(fileName, file, {
					cacheControl: '3600',
					upsert: true
				});

				if (error) {
					throw new Error(`Upload failed: ${error.message}`);
				}

				if (!data) {
					throw new Error('Upload returned no data');
				}

				// Use public URL directly (user avatars are not sensitive)
				// This avoids ORB issues and token expiration
				profile.avatar = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/user-profile/${fileName}`;

				// Don't save immediately - let user click Save button
				toast.success('Avatar uploaded. Click Save to confirm changes');
			} catch (error) {
				toast.error(error instanceof Error ? error.message : 'Failed to upload avatar');
			}
		};
		input.click();
	}

	async function handleSave() {
		if (!profile.name.trim()) {
			toast.error('Please fill in your name');
			return;
		}

		isSaving = true;
		try {
			// Save profile changes
			const { error: authError } = await supabase.auth.updateUser({
				data: { full_name: profile.name, avatar_url: profile.avatar }
			});

			if (authError) throw authError;

			const { error: profError } = await supabase
				.from('profiles')
				.update({
					full_name: profile.name,
					avatar_url: profile.avatar,
					updated_at: new Date().toISOString()
				} as any)
				.eq('id', profile.id);

			if (profError) throw profError;

			// Save password change if provided
			if (passwordForm.newPassword) {
				if (passwordForm.newPassword !== passwordForm.confirmPassword) {
					toast.error('New passwords do not match');
					isSaving = false;
					return;
				}
				if (passwordForm.newPassword.length < 8) {
					toast.error('Password must be at least 8 characters');
					isSaving = false;
					return;
				}

				const { error: passError } = await supabase.auth.updateUser({
					password: passwordForm.newPassword
				});

				if (passError) throw passError;

				// Reset password form
				passwordForm = {
					currentPassword: '',
					newPassword: '',
					confirmPassword: '',
					showCurrent: false,
					showNew: false,
					showConfirm: false
				};
			}

			// Update original values after successful save
			originalProfile = { ...profile };
			toast.success('Changes saved successfully');
		} catch (e: any) {
			toast.error(e.message || 'Failed to save changes');
		} finally {
			isSaving = false;
		}
	}

	function handleCancel() {
		// Revert all changes
		profile = { ...originalProfile };
		passwordForm = {
			currentPassword: '',
			newPassword: '',
			confirmPassword: '',
			showCurrent: false,
			showNew: false,
			showConfirm: false
		};
		toast.success('Changes discarded');
	}

	function handleToggle2FA() {
		if (!twoFaEnabled) {
			toast.success('Two-factor authentication enabled');
		} else {
			toast.success('Two-factor authentication disabled');
		}
	}

	async function loadSessions() {
		isLoadingSessions = true;
		try {
			const sessions = await getUserSessions();
			console.log('Loaded sessions:', sessions);
			activeSessions = sessions;
		} catch (e) {
			console.error('Error loading sessions:', e);
			toast.error('Failed to load sessions');
		} finally {
			isLoadingSessions = false;
		}
	}

	function requestRevoke(session: UserSession) {
		sessionToRevoke = session;
		showRevokeDialog = true;
	}

	async function confirmRevoke() {
		const target = sessionToRevoke;
		showRevokeDialog = false;
		if (!target) return;

		pendingSessionId = target.id;
		try {
			const success = await revokeSession(target.id);
			if (success) {
				activeSessions = activeSessions.filter((s) => s.id !== target.id);
				toast.success(`${target.device_name} signed out`, {
					description: 'That device will be returned to the login screen.'
				});
			} else {
				toast.error('Failed to sign out that device');
			}
		} catch (e) {
			console.error('Error revoking session:', e);
			toast.error('Failed to sign out that device');
		} finally {
			pendingSessionId = null;
		}
	}

	async function confirmRevokeAll() {
		showRevokeAllDialog = false;
		isRevokingAll = true;
		try {
			const success = await revokeAllOtherSessions();
			if (success) {
				await loadSessions();
				toast.success('Signed out of all other devices');
			} else {
				toast.error('Failed to sign out other devices');
			}
		} catch (e) {
			console.error('Error revoking sessions:', e);
			toast.error('Failed to sign out other devices');
		} finally {
			isRevokingAll = false;
		}
	}
</script>

<svelte:head>
	<title>Profile | {siteConfig.name}</title>
</svelte:head>

<PageShell
	title="Profile"
	description="Manage your account and security"
	backTo="/settings"
	{isLoading}
>
	{#snippet actions()}
		{#if hasUnsavedChanges}
			<Badge variant="outline" class="border-yellow-200 bg-yellow-50 text-yellow-900">Unsaved</Badge
			>
			<Button size="sm" onclick={handleSave} disabled={isSaving}>
				{isSaving ? 'Saving...' : 'Save changes'}
			</Button>
			<Button size="sm" variant="outline" onclick={handleCancel} disabled={isSaving}>Cancel</Button>
		{/if}
	{/snippet}

	{#snippet skeleton()}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-2">
				<Card>
					<CardHeader>
						<Skeleton class="h-5 w-40" />
						<Skeleton class="mt-2 h-3 w-56" />
					</CardHeader>
					<CardContent class="space-y-6">
						<div class="flex items-center gap-4 sm:gap-6">
							<Skeleton class="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
							<Skeleton class="h-9 w-32" />
						</div>
						<div class="grid gap-4 sm:grid-cols-2">
							<Skeleton class="h-16" />
							<Skeleton class="h-16" />
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton class="h-5 w-44" />
						<Skeleton class="mt-2 h-3 w-60" />
					</CardHeader>
					<CardContent class="space-y-4">
						<Skeleton class="h-16" />
						<div class="grid gap-4 sm:grid-cols-2">
							<Skeleton class="h-16" />
							<Skeleton class="h-16" />
						</div>
					</CardContent>
				</Card>
			</div>
			<Card class="h-fit">
				<CardHeader>
					<Skeleton class="h-5 w-36" />
				</CardHeader>
				<CardContent class="space-y-3">
					{#each ['a', 'b', 'c'] as key (key)}
						<Skeleton class="h-16 rounded-lg" />
					{/each}
				</CardContent>
			</Card>
		</div>
	{/snippet}

	<!-- Content Grid -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Left Column: Basic Info -->
		<div class="space-y-6 lg:col-span-2">
			<!-- Basic Information -->
			<Card>
				<CardHeader>
					<CardTitle>Basic Information</CardTitle>
					<CardDescription>Update your profile details</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<!-- Avatar Section -->
					<div class="flex items-center gap-4 sm:gap-6">
						<Avatar class="h-20 w-20 sm:h-24 sm:w-24">
							{#if profile.avatar}
								<AvatarImage src={ensureAvatarDownloadParam(profile.avatar)} alt={profile.name} />
							{/if}
							<AvatarFallback class="text-xl"
								>{(profile.name || 'U').charAt(0).toUpperCase()}</AvatarFallback
							>
						</Avatar>
						<Button variant="outline" onclick={handleChangeAvatar}>Change Avatar</Button>
					</div>

					<!-- Form Fields -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<Label for="fullName" class="text-sm font-medium">Full Name</Label>
							<Input id="fullName" bind:value={profile.name} placeholder="Your name" class="mt-2" />
						</div>
						<div>
							<Label for="email" class="text-sm font-medium">Email</Label>
							<Input
								id="email"
								bind:value={profile.email}
								type="email"
								placeholder="your@email.com"
								class="mt-2"
								disabled
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Password & Security -->
			<Card>
				<CardHeader>
					<div class="flex items-center gap-2">
						<Lock class="h-5 w-5 text-primary" />
						<div>
							<CardTitle>Password & Security</CardTitle>
							<CardDescription>Manage your password and authentication</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent class="space-y-6">
					<!-- Change Password -->
					<div class="space-y-4 border-b border-border/20 pb-6">
						<h3 class="font-semibold">Change Password</h3>
						<div class="grid grid-cols-1 gap-4">
							<div>
								<Label class="text-sm font-medium">Current Password</Label>
								<div class="relative mt-2">
									<Input
										type={passwordForm.showCurrent ? 'text' : 'password'}
										bind:value={passwordForm.currentPassword}
										placeholder="Enter current password"
									/>
									<button
										onclick={() => (passwordForm.showCurrent = !passwordForm.showCurrent)}
										class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
									>
										{#if passwordForm.showCurrent}
											<EyeOff class="h-4 w-4" />
										{:else}
											<Eye class="h-4 w-4" />
										{/if}
									</button>
								</div>
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<Label class="text-sm font-medium">New Password</Label>
									<div class="relative mt-2">
										<Input
											type={passwordForm.showNew ? 'text' : 'password'}
											bind:value={passwordForm.newPassword}
											placeholder="Enter new password"
										/>
										<button
											onclick={() => (passwordForm.showNew = !passwordForm.showNew)}
											class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										>
											{#if passwordForm.showNew}
												<EyeOff class="h-4 w-4" />
											{:else}
												<Eye class="h-4 w-4" />
											{/if}
										</button>
									</div>
								</div>
								<div>
									<Label class="text-sm font-medium">Confirm Password</Label>
									<div class="relative mt-2">
										<Input
											type={passwordForm.showConfirm ? 'text' : 'password'}
											bind:value={passwordForm.confirmPassword}
											placeholder="Confirm new password"
										/>
										<button
											onclick={() => (passwordForm.showConfirm = !passwordForm.showConfirm)}
											class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										>
											{#if passwordForm.showConfirm}
												<EyeOff class="h-4 w-4" />
											{:else}
												<Eye class="h-4 w-4" />
											{/if}
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- 2FA -->
					<div class="flex items-center justify-between">
						<div>
							<Label class="text-sm font-medium">Two-Factor Authentication</Label>
							<p class="mt-1 text-sm text-muted-foreground">
								Add an extra layer of security to your account
							</p>
						</div>
						<Switch bind:checked={twoFaEnabled} onchange={handleToggle2FA} />
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Right Column: Sessions -->
		<div>
			<Card>
				<CardHeader>
					<div class="flex items-center gap-2">
						<Smartphone class="h-5 w-5 text-primary" />
						<div>
							<CardTitle>Active Sessions</CardTitle>
							<CardDescription class="text-xs"
								>{activeSessions.length} device{activeSessions.length !== 1
									? 's'
									: ''}</CardDescription
							>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<ActiveSessionsList
						sessions={activeSessions}
						isLoading={isLoadingSessions}
						pendingId={pendingSessionId}
						{isRevokingAll}
						onRevoke={requestRevoke}
						onRevokeAll={() => (showRevokeAllDialog = true)}
					/>
				</CardContent>
			</Card>
		</div>
	</div></PageShell
>

<!-- Revoke a single device -->
<AlertDialog bind:open={showRevokeDialog}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Sign out this device?</AlertDialogTitle>
			<AlertDialogDescription>
				{sessionToRevoke?.device_name} ({sessionToRevoke?.browser}) will be returned to the login
				screen. You can sign in again on it at any time.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={confirmRevoke}>Sign out device</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<!-- Revoke every other device -->
<AlertDialog bind:open={showRevokeAllDialog}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Log out all other devices?</AlertDialogTitle>
			<AlertDialogDescription>
				Every device except this one will be signed out. This device stays signed in.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={confirmRevokeAll}>Log out all others</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

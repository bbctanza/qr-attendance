<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import {
		ChevronLeft,
		Mail,
		ShieldCheck,
		Lock,
		Send,
		CheckCircle2,
		AlertCircle,
		Loader2,
		Eye,
		EyeOff,
		Users,
		UserMinus,
		RefreshCw
	} from '@lucide/svelte';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { logAuditChange } from '$lib/utils/auditLogger';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let activeTab = $state('invite'); // "invite" or "manage"
	let inviteEmail = $state('');
	let inviteRole = $state('staff');
	let adminPassword = $state('');
	let showPassword = $state(false);
	let isLoading = $state(false);
	let adminProfile = $state<any>(null);
	let pageLoading = $state(true);

	// Management State
	let staffUsers = $state<any[]>([]);
	let isFetchingUsers = $state(false);
	let isDeleteDialogOpen = $state(false);
	let isRoleUpdateOpen = $state(false);
	let userToDelete = $state<any>(null);
	let roleUpdateData = $state<{ userId: string; newRole: string } | null>(null);

	const roles = [
		{ value: 'admin', label: 'Administrator' },
		{ value: 'staff', label: 'Staff' },
		{ value: 'guest', label: 'Guest' },
		{ value: 'developer', label: 'Developer' }
	];

	onMount(async () => {
		try {
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (!user) {
				goto('/');
				return;
			}

			const { data: profile } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', user.id)
				.single();

			if (!profile || (profile.role !== 'admin' && profile.role !== 'developer')) {
				toast.error('Unauthorized access');
				goto('/settings');
				return;
			}
			adminProfile = profile;
		} catch (e) {
			console.error(e);
			goto('/settings');
		} finally {
			pageLoading = false;
		}
	});

	async function fetchUsers() {
		isFetchingUsers = true;
		try {
			const { data, error } = await supabase.functions.invoke('invitation-service', {
				body: { action: 'list-users' }
			});
			if (error) throw error;
			staffUsers = data.users || [];
		} catch (e: any) {
			toast.error(e.message || 'Failed to fetch users');
		} finally {
			isFetchingUsers = false;
		}
	}

	$effect(() => {
		if (activeTab === 'manage' && staffUsers.length === 0) {
			fetchUsers().catch(console.error);
		}
	});

	async function handleUpdateRole(userId: string, newRole: string) {
		adminPassword = ''; // Clear for modal
		roleUpdateData = { userId, newRole };
		isRoleUpdateOpen = true;
	}

	async function confirmRoleUpdate() {
		if (!roleUpdateData || !adminPassword) {
			toast.error('Password is required');
			return;
		}

		try {
			// Get the user profile before the update for audit logging
			const { data: userBefore } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', roleUpdateData.userId)
				.single();

			const { error } = await supabase.functions.invoke('invitation-service', {
				body: {
					action: 'update-role',
					userId: roleUpdateData.userId,
					newRole: roleUpdateData.newRole,
					password: adminPassword
				}
			});
			if (error) throw error;

			// Get current session for audit logging
			const {
				data: { session }
			} = await supabase.auth.getSession();

			// Log the role change
			await logAuditChange(
				{
					entityType: 'user',
					entityId: roleUpdateData.userId,
					action: 'update',
					before: userBefore ? { role: userBefore.role } : undefined,
					after: { role: roleUpdateData.newRole },
					reason: `Role changed from ${userBefore?.role} to ${roleUpdateData.newRole}`,
					tags: ['staff-management', 'role-change']
				},
				session
			);

			toast.success('Role updated successfully');
			await fetchUsers();
			isRoleUpdateOpen = false;
		} catch (e: any) {
			toast.error(e.message || 'Failed to update role');
		} finally {
			roleUpdateData = null;
		}
	}

	async function handleDeleteUser(userId: string) {
		adminPassword = ''; // Clear for modal
		userToDelete = staffUsers.find((u) => u.id === userId);
		isDeleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!userToDelete || !adminPassword) {
			toast.error('Password is required');
			return;
		}

		try {
			// Store user data before deletion for audit logging
			const userEmail = userToDelete.email;
			const userRole = userToDelete.role;
			const userId = userToDelete.id;

			const { error } = await supabase.functions.invoke('invitation-service', {
				body: {
					action: 'delete-user',
					userId: userToDelete.id,
					password: adminPassword
				}
			});
			if (error) throw error;

			// Get current session for audit logging
			const {
				data: { session }
			} = await supabase.auth.getSession();

			// Log the user deletion
			await logAuditChange(
				{
					entityType: 'user',
					entityId: userId,
					action: 'delete',
					before: { email: userEmail, role: userRole },
					reason: `User ${userEmail} (${userRole}) removed from system`,
					tags: ['user-deletion', 'staff-management']
				},
				session
			);

			toast.success('User removed from system');
			await fetchUsers();
			isDeleteDialogOpen = false;
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete user');
		} finally {
			userToDelete = null;
		}
	}

	async function handleSendInvite() {
		if (!inviteEmail || !adminPassword) {
			toast.error('Please fill in all fields');
			return;
		}

		isLoading = true;
		try {
			// Use Supabase Edge Function to verify password and send invite
			const { data, error } = await supabase.functions.invoke('invitation-service', {
				body: {
					action: 'send-invite',
					password: adminPassword,
					inviteEmail: inviteEmail,
					inviteRole: inviteRole
				}
			});

			if (error) throw error;
			if (data?.error) throw new Error(data.error);

			// Get current session for audit logging
			const {
				data: { session }
			} = await supabase.auth.getSession();

			// Log the invitation
			await logAuditChange(
				{
					entityType: 'user',
					entityId: inviteEmail, // Use email as identifier for new invites
					action: 'create',
					after: { email: inviteEmail, role: inviteRole },
					reason: `Invitation sent to ${inviteEmail} with ${inviteRole} role`,
					tags: ['invite', 'staff-management']
				},
				session
			);

			toast.success('Invitation sent successfully!');
			inviteEmail = '';
		} catch (e: any) {
			console.error(e);
			toast.error(e.message || 'Failed to send invitation');
		} finally {
			isLoading = false;
		}
	}
</script>

{#if pageLoading}
	<div class="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
		<!-- Header Skeleton -->
		<div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
			<div class="flex items-center gap-4">
				<Skeleton class="h-10 w-10 rounded-xl" />
				<div class="space-y-2">
					<Skeleton class="h-8 w-40" />
					<Skeleton class="h-4 w-32" />
				</div>
			</div>
			<Skeleton class="h-10 w-full sm:w-48 rounded-xl" />
		</div>

		<!-- Content Skeleton (Invite Tab Layout) -->
		<div class="space-y-6">
			<div class="space-y-4 rounded-2xl border border-border/30 bg-card p-6">
				<Skeleton class="h-5 w-40 mb-4" />
				<div class="space-y-2">
					<Skeleton class="h-4 w-32" />
					<Skeleton class="h-10 w-full" />
				</div>
				<div class="space-y-2">
					<Skeleton class="h-4 w-24" />
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
						<Skeleton class="h-9 w-full" />
						<Skeleton class="h-9 w-full" />
						<Skeleton class="h-9 w-full" />
					</div>
				</div>
			</div>
			<div class="space-y-4 rounded-2xl border border-border/30 bg-card p-6">
				<Skeleton class="h-5 w-48 mb-4" />
				<div class="space-y-2">
					<Skeleton class="h-4 w-32" />
					<Skeleton class="h-10 w-full" />
					<Skeleton class="h-3 w-64 mt-1" />
				</div>
				<Skeleton class="h-12 w-full rounded-xl" />
			</div>
		</div>
	</div>
{:else}
	<div class="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
		<!-- Header -->
		<div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
			<div class="flex items-center gap-4">
				<Button
					variant="ghost"
					size="icon"
					onclick={() => goto('/settings')}
					class="shrink-0 rounded-xl"
				>
					<ChevronLeft class="h-5 w-5" />
				</Button>
				<div class="min-w-0">
					<h1 class="truncate text-2xl font-bold md:text-3xl">Administration</h1>
					<p class="mt-1 text-sm text-muted-foreground md:text-base">Manage System Access</p>
				</div>
			</div>

			<div class="flex w-full rounded-xl bg-muted p-1 sm:w-auto">
				<button
					class="flex-1 rounded-lg px-4 py-2 text-xs font-bold transition-all sm:flex-none {activeTab ===
					'invite'
						? 'bg-background shadow-sm'
						: 'text-muted-foreground'}"
					onclick={() => (activeTab = 'invite')}
				>
					Invite
				</button>
				<button
					class="flex-1 rounded-lg px-4 py-2 text-xs font-bold transition-all sm:flex-none {activeTab ===
					'manage'
						? 'bg-background shadow-sm'
						: 'text-muted-foreground'}"
					onclick={() => (activeTab = 'manage')}
				>
					Staff List
				</button>
			</div>
		</div>

		<div class="space-y-6">
			{#if activeTab === 'invite'}
				<!-- Step 1: Basic Info -->
				<div class="space-y-4 rounded-2xl border border-border/30 bg-card p-6">
					<div
						class="mb-2 flex items-center gap-2 text-sm font-bold tracking-widest text-primary uppercase"
					>
						<Mail class="h-4 w-4" /> 1. Invitation Details
					</div>

					<div class="space-y-2">
						<Label for="email">Invitee Email Address</Label>
						<Input
							id="email"
							type="email"
							placeholder="name@example.com"
							bind:value={inviteEmail}
						/>
					</div>

					<div class="space-y-2">
						<Label for="role">Assign Role</Label>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
							{#each roles.filter((r) => r.value !== 'developer') as role}
								<button
									class="rounded-xl border px-3 py-2 text-xs font-bold transition-all {inviteRole ===
									role.value
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border/40 bg-card hover:bg-muted'}"
									onclick={() => (inviteRole = role.value)}
								>
									{role.label}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Step 2: Authentication -->
				<div class="space-y-4 rounded-2xl border border-border/30 bg-card p-6">
					<div
						class="mb-2 flex items-center gap-2 text-sm font-bold tracking-widest text-primary uppercase"
					>
						<Lock class="h-4 w-4" /> 2. Security Verification
					</div>

					<div class="space-y-2">
						<Label for="password">Your Password</Label>
						<div class="relative">
							<Input
								id="password"
								type={showPassword ? 'text' : 'password'}
								placeholder="Enter your current password"
								bind:value={adminPassword}
								class="pr-10"
							/>
							<button
								type="button"
								class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
								onclick={() => (showPassword = !showPassword)}
							>
								{#if showPassword}
									<EyeOff class="h-4 w-4" />
								{:else}
									<Eye class="h-4 w-4" />
								{/if}
							</button>
						</div>
						<p class="text-[10px] text-muted-foreground italic">
							Required to prevent unauthorized accounts from sending invites.
						</p>
					</div>

					<Button
						class="h-12 w-full rounded-xl font-bold"
						onclick={handleSendInvite}
						disabled={isLoading || !inviteEmail || !adminPassword}
					>
						{#if isLoading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Sending...
						{:else}
							<Send class="mr-2 h-4 w-4" />
							Send Invitation
						{/if}
					</Button>
				</div>

				<div class="flex items-start gap-3 rounded-2xl border border-border/10 bg-muted/30 p-4">
					<AlertCircle class="h-5 w-5 shrink-0 text-muted-foreground" />
					<p class="text-xs leading-relaxed font-medium text-muted-foreground">
						The invitee will receive an email directly from Supabase to set up their account. This
						invitation bypasses 2FA for convenience.
					</p>
				</div>
			{:else}
				<!-- Manage Users View -->
				<div class="overflow-hidden rounded-2xl border border-border/30 bg-card">
					<div
						class="flex items-center justify-between border-b border-border/30 bg-muted/20 px-6 py-4"
					>
						<div
							class="flex items-center gap-2 text-sm font-bold tracking-widest text-primary uppercase"
						>
							<Users class="h-4 w-4" /> Staff List
						</div>
						<Button variant="ghost" size="icon" onclick={fetchUsers} disabled={isFetchingUsers}>
							<RefreshCw class="h-4 w-4 {isFetchingUsers ? 'animate-spin' : ''}" />
						</Button>
					</div>

					<div class="divide-y divide-border/30">
						{#if isFetchingUsers}
							<div class="flex flex-col items-center justify-center gap-4 p-12">
								<Loader2 class="h-8 w-8 animate-spin text-primary" />
								<p class="text-sm text-muted-foreground">Loading staff members...</p>
							</div>
						{:else if staffUsers.length === 0}
							<div class="p-12 text-center text-muted-foreground">No staff members found.</div>
						{:else}
							{#each staffUsers as staff}
								<div
									class="flex flex-col justify-between gap-4 p-4 transition-colors hover:bg-muted/10 sm:flex-row sm:items-center"
								>
									<div class="flex min-w-0 flex-1 items-center gap-4">
										<Avatar class="h-10 w-10 border border-border/30">
											<AvatarImage src={staff.avatar_url} />
											<AvatarFallback>{staff.full_name?.charAt(0) || '?'}</AvatarFallback>
										</Avatar>
										<div class="min-w-0 flex-1">
											<div class="truncate text-sm font-bold">
												{staff.full_name || 'Anonymous User'}
											</div>
											<div class="truncate text-[10px] text-muted-foreground italic">
												{staff.email}
											</div>
										</div>
										<Badge
											variant="outline"
											class="h-5 px-1.5 text-[9px] tracking-tighter uppercase">{staff.role}</Badge
										>
									</div>

									<div class="flex items-center gap-2">
										<Select.Root
											type="single"
											value={staff.role}
											disabled={staff.role === 'developer'}
											onValueChange={(v) => handleUpdateRole(staff.id, v)}
										>
											<Select.Trigger class="h-8 w-28 rounded-lg px-2 text-xs font-bold">
												{staff.role.charAt(0).toUpperCase() + staff.role.slice(1)}
											</Select.Trigger>
											<Select.Content class="rounded-xl border border-border/30 shadow-xl">
												{#each roles.filter((r) => r.value !== 'developer') as r}
													<Select.Item value={r.value} class="rounded-lg py-2 text-xs font-bold">
														{r.label}
													</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>

										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8 rounded-lg text-red-500 hover:bg-red-500/10 hover:text-red-600"
											onclick={() => handleDeleteUser(staff.id)}
											disabled={staff.id === adminProfile.id || staff.role === 'developer'}
										>
											<UserMinus class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<AlertDialog.Root bind:open={isDeleteDialogOpen}>
	<AlertDialog.Content class="rounded-2xl">
		<AlertDialog.Header>
			<AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete <span class="font-bold text-foreground"
					>{userToDelete?.full_name || userToDelete?.email || 'this user'}</span
				>. Enter your password to confirm this action.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="space-y-2 py-4">
			<Label for="del-password">Your Password</Label>
			<div class="relative">
				<Input
					id="del-password"
					type={showPassword ? 'text' : 'password'}
					placeholder="Confirm your password"
					bind:value={adminPassword}
					class="rounded-xl pr-10"
				/>
				<button
					type="button"
					class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<EyeOff class="h-4 w-4" />
					{:else}
						<Eye class="h-4 w-4" />
					{/if}
				</button>
			</div>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel class="rounded-xl">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={confirmDelete}
				class="text-destructive-foreground rounded-xl bg-destructive hover:bg-destructive/90"
			>
				Permanently Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={isRoleUpdateOpen}>
	<AlertDialog.Content class="rounded-2xl">
		<AlertDialog.Header>
			<AlertDialog.Title>Confirm Role Change</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to change this user's role to <span
					class="font-bold text-foreground uppercase">{roleUpdateData?.newRole}</span
				>? Enter your password to confirm.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="space-y-2 py-4">
			<Label for="role-password">Your Password</Label>
			<div class="relative">
				<Input
					id="role-password"
					type={showPassword ? 'text' : 'password'}
					placeholder="Confirm your password"
					bind:value={adminPassword}
					class="rounded-xl pr-10"
				/>
				<button
					type="button"
					class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<EyeOff class="h-4 w-4" />
					{:else}
						<Eye class="h-4 w-4" />
					{/if}
				</button>
			</div>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel class="rounded-xl">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={confirmRoleUpdate}
				class="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
			>
				Confirm Change
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

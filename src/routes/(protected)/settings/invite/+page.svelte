<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import {
		ChevronLeft,
		ChevronRight,
		Send,
		Loader2,
		Eye,
		EyeOff,
		Users,
		UserMinus,
		RefreshCw,
		Search,
		UserPlus
	} from '@lucide/svelte';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { logAuditChange } from '$lib/utils/auditLogger';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let inviteEmail = $state('');
	let inviteRole = $state('staff');
	let adminPassword = $state('');
	let showPassword = $state(false);
	let isLoading = $state(false);
	let adminProfile = $state<any>(null);
	let pageLoading = $state(true);

	// Management & Directory State
	let searchQuery = $state('');
	let staffUsers = $state<any[]>([]);
	let isFetchingUsers = $state(false);
	let isDeleteDialogOpen = $state(false);
	let isRoleUpdateOpen = $state(false);
	let userToDelete = $state<any>(null);
	let roleUpdateData = $state<{ userId: string; newRole: string } | null>(null);

	const roles = [
		{ value: 'admin', label: 'Administrator' },
		{ value: 'staff', label: 'Staff' },
		{ value: 'guest', label: 'Guest' }
	];

	// Filtered staff list by search query
	let filteredStaff = $derived(
		staffUsers.filter((u) => {
			const q = searchQuery.trim().toLowerCase();
			if (!q) return true;
			const name = (u.full_name || '').toLowerCase();
			const email = (u.email || '').toLowerCase();
			const role = (u.role || '').toLowerCase();
			return name.includes(q) || email.includes(q) || role.includes(q);
		})
	);

	// Pagination State
	let currentPage = $state(1);
	let pageSize = $state(10);

	$effect(() => {
		searchQuery;
		currentPage = 1;
	});

	let totalPages = $derived(Math.max(1, Math.ceil(filteredStaff.length / pageSize)));

	let paginatedStaff = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredStaff.slice(start, start + pageSize);
	});

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
			await fetchUsers();
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
			// 1. Direct database query to profiles table (fast & always accessible)
			const { data: dbProfiles, error: dbError } = await supabase
				.from('profiles')
				.select('*')
				.order('created_at', { ascending: false });

			if (!dbError && dbProfiles && dbProfiles.length > 0) {
				staffUsers = dbProfiles;
				return;
			}

			// 2. Fallback to invitation-service edge function if direct client query returned empty/error
			const { data, error } = await supabase.functions.invoke('invitation-service', {
				body: { action: 'list-users' }
			});
			if (error) throw error;
			staffUsers = data?.users || dbProfiles || [];
		} catch (e: any) {
			console.error('Error fetching staff directory:', e);
			toast.error(e.message || 'Failed to fetch staff directory');
		} finally {
			isFetchingUsers = false;
		}
	}

	function handleUpdateRole(userId: string, newRole: string) {
		adminPassword = '';
		showPassword = false;
		roleUpdateData = { userId, newRole };
		isRoleUpdateOpen = true;
	}

	async function confirmRoleUpdate() {
		if (!roleUpdateData || !adminPassword) {
			toast.error('Password is required');
			return;
		}

		try {
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

			const {
				data: { session }
			} = await supabase.auth.getSession();

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

			toast.success('User role updated successfully');
			await fetchUsers();
			isRoleUpdateOpen = false;
		} catch (e: any) {
			toast.error(e.message || 'Failed to update role');
		} finally {
			roleUpdateData = null;
		}
	}

	function handleDeleteUser(userId: string) {
		adminPassword = '';
		showPassword = false;
		userToDelete = staffUsers.find((u) => u.id === userId);
		isDeleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!userToDelete || !adminPassword) {
			toast.error('Password is required');
			return;
		}

		try {
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

			const {
				data: { session }
			} = await supabase.auth.getSession();

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

			toast.success('Staff member removed successfully');
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

			const {
				data: { session }
			} = await supabase.auth.getSession();

			await logAuditChange(
				{
					entityType: 'user',
					entityId: inviteEmail,
					action: 'create',
					after: { email: inviteEmail, role: inviteRole },
					reason: `Invitation sent to ${inviteEmail} with ${inviteRole} role`,
					tags: ['invite', 'staff-management']
				},
				session
			);

			toast.success('Invitation sent successfully!');
			inviteEmail = '';
			adminPassword = '';
			await fetchUsers();
		} catch (e: any) {
			console.error(e);
			toast.error(e.message || 'Failed to send invitation');
		} finally {
			isLoading = false;
		}
	}
</script>

{#if pageLoading}
	<div class="flex w-full flex-col gap-6 p-4 md:p-6 lg:p-8">
		<div class="flex items-center gap-4">
			<Skeleton class="h-10 w-10 rounded-lg" />
			<div class="space-y-2">
				<Skeleton class="h-8 w-40" />
				<Skeleton class="h-4 w-32" />
			</div>
		</div>
		<div class="space-y-6">
			<Skeleton class="h-48 w-full rounded-xl" />
			<Skeleton class="h-96 w-full rounded-xl" />
		</div>
	</div>
{:else}
	<div class="flex w-full flex-col gap-6 p-4 md:p-6 lg:p-8">
		<!-- Header with System Breadcrumb -->
		<div class="hidden items-center gap-3 sm:flex sm:gap-4">
			<button
				onclick={() => goto('/settings')}
				class="shrink-0 rounded-lg p-2 transition hover:bg-muted"
			>
				<ChevronLeft class="h-5 w-5 sm:h-6 sm:w-6" />
			</button>
			<div class="min-w-0 flex-1">
				<h1 class="text-2xl font-bold md:text-3xl">Manage Staff</h1>
				<p class="mt-1 hidden text-sm text-muted-foreground sm:block">
					Invite new staff members, assign user roles, and manage permissions
				</p>
			</div>
		</div>

		<!-- Mobile Header -->
		<div class="flex items-center gap-3 sm:hidden">
			<button
				onclick={() => goto('/settings')}
				class="shrink-0 rounded-lg p-2 transition hover:bg-muted"
			>
				<ChevronLeft class="h-5 w-5" />
			</button>
			<div>
				<h1 class="text-xl font-bold">Manage Staff</h1>
				<p class="text-xs text-muted-foreground">Invite & manage user roles</p>
			</div>
		</div>

		<!-- 1. Invite New Staff Member Card -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<UserPlus class="h-5 w-5 shrink-0 text-primary" />
					<div>
						<CardTitle class="text-base font-bold sm:text-lg">Invite New Staff Member</CardTitle>
						<CardDescription class="mt-0.5 text-xs text-muted-foreground">
							Send an invitation email to grant system access and assign user roles.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent class="p-4 sm:p-6">
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleSendInvite();
					}}
					class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end"
				>
					<!-- Email Input -->
					<div class="space-y-1.5">
						<Label for="email" class="text-xs font-medium text-foreground">Invitee Email Address</Label>
						<Input
							id="email"
							type="email"
							placeholder="colleague@organization.com"
							bind:value={inviteEmail}
							class="h-9 text-xs"
						/>
					</div>

					<!-- Role Selector -->
					<div class="space-y-1.5">
						<Label class="text-xs font-medium text-foreground">Assign System Role</Label>
						<Select.Root type="single" bind:value={inviteRole}>
							<Select.Trigger class="h-9 w-full text-xs">
								{roles.find((r) => r.value === inviteRole)?.label || 'Select Role'}
							</Select.Trigger>
							<Select.Content>
								{#each roles as r}
									<Select.Item value={r.value} class="text-xs">{r.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- Password Input -->
					<div class="space-y-1.5">
						<Label for="password" class="text-xs font-medium text-foreground">Your Password</Label>
						<div class="relative">
							<Input
								id="password"
								type={showPassword ? 'text' : 'password'}
								placeholder="Confirm password"
								bind:value={adminPassword}
								class="h-9 pr-8 text-xs"
							/>
							<button
								type="button"
								class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground focus:outline-none"
								onclick={() => (showPassword = !showPassword)}
								title={showPassword ? 'Hide password' : 'Show password'}
							>
								{#if showPassword}
									<EyeOff class="h-3.5 w-3.5" />
								{:else}
									<Eye class="h-3.5 w-3.5" />
								{/if}
							</button>
						</div>
					</div>

					<!-- Submit Button -->
					<div>
						<Button
							type="submit"
							class="h-9 w-full text-xs font-medium gap-1.5"
							disabled={isLoading || !inviteEmail || !adminPassword}
						>
							{#if isLoading}
								<Loader2 class="h-3.5 w-3.5 animate-spin" />
								Sending...
							{:else}
								<Send class="h-3.5 w-3.5" />
								Send Invite
							{/if}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>

		<!-- 2. Staff Directory Card (Full Width Table) -->
		<Card>
			<CardHeader class="px-4 py-3 sm:px-6">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-center gap-2">
						<Users class="h-5 w-5 text-primary shrink-0" />
						<div>
							<div class="flex items-center gap-2">
								<CardTitle class="text-base font-bold sm:text-lg">Staff Directory</CardTitle>
								<Badge variant="secondary" class="text-[10px]">{staffUsers.length} Accounts</Badge>
							</div>
							<CardDescription class="mt-0.5 text-xs text-muted-foreground">
								Manage active staff accounts, modify user roles, or remove permissions.
							</CardDescription>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<div class="relative flex-1 sm:w-56 sm:flex-initial">
							<Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								type="search"
								placeholder="Search staff members..."
								bind:value={searchQuery}
								class="h-8 pl-8 text-xs"
							/>
						</div>
						<Button
							variant="outline"
							size="sm"
							onclick={fetchUsers}
							disabled={isFetchingUsers}
							class="h-8 shrink-0 px-2.5 text-xs gap-1.5"
						>
							<RefreshCw class="h-3.5 w-3.5 {isFetchingUsers ? 'animate-spin' : ''}" />
							<span class="hidden sm:inline">Refresh</span>
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent class="p-0">
				{#if isFetchingUsers}
					<div class="flex flex-col items-center justify-center gap-2 py-12">
						<Loader2 class="h-6 w-6 animate-spin text-primary" />
						<p class="text-xs text-muted-foreground">Loading staff directory...</p>
					</div>
				{:else if filteredStaff.length === 0}
					<div class="p-12 text-center text-xs text-muted-foreground">
						{#if searchQuery}
							No staff members matching "{searchQuery}"
						{:else}
							No staff members found.
						{/if}
					</div>
				{:else}
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow class="bg-muted/50">
									<TableHead class="px-4 sm:px-6 font-semibold text-xs text-muted-foreground">Staff Member</TableHead>
									<TableHead class="px-4 sm:px-6 w-44 font-semibold text-xs text-muted-foreground">System Role</TableHead>
									<TableHead class="px-4 sm:px-6 w-28 text-right font-semibold text-xs text-muted-foreground">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each paginatedStaff as staff}
									<TableRow class="transition-colors hover:bg-muted/30">
										<TableCell class="px-4 sm:px-6">
											<div class="flex items-center gap-3">
												<Avatar class="h-8 w-8 shrink-0 border">
													<AvatarImage src={staff.avatar_url} />
													<AvatarFallback class="text-xs font-semibold">
														{staff.full_name?.charAt(0) || staff.email?.charAt(0) || '?'}
													</AvatarFallback>
												</Avatar>
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-2">
														<span class="truncate text-xs font-semibold text-foreground">
															{staff.full_name || 'Anonymous User'}
														</span>
														{#if staff.id === adminProfile?.id}
															<Badge variant="secondary" class="h-4 px-1 text-[9px]">You</Badge>
														{/if}
													</div>
													<div class="truncate text-[11px] text-muted-foreground">
														{staff.email}
													</div>
												</div>
											</div>
										</TableCell>
										<TableCell class="px-4 sm:px-6">
											<Select.Root
												type="single"
												value={staff.role}
												disabled={staff.role === 'developer'}
												onValueChange={(v) => handleUpdateRole(staff.id, v)}
											>
												<Select.Trigger class="h-8 w-32 text-xs font-medium">
													{staff.role ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1) : 'Select'}
												</Select.Trigger>
												<Select.Content>
													// eslint-disable-next-line svelte/require-each-key
													{#each roles as r}
														<Select.Item value={r.value} class="text-xs">
															{r.label}
														</Select.Item>
													{/each}
												</Select.Content>
											</Select.Root>
										</TableCell>
										<TableCell class="px-4 sm:px-6 text-right">
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
												onclick={() => handleDeleteUser(staff.id)}
												disabled={staff.id === adminProfile?.id || staff.role === 'developer'}
												title="Remove User"
											>
												<UserMinus class="h-4 w-4" />
											</Button>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>

			<!-- Pagination Footer -->
			{#if filteredStaff.length > 0}
				<CardFooter class="border-t px-4 py-2.5 sm:px-6 sm:py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3">
					<div class="flex items-center gap-4 text-xs text-muted-foreground">
						<span>
							Showing <strong>{Math.min((currentPage - 1) * pageSize + 1, filteredStaff.length)}</strong> to{' '}
							<strong>{Math.min(currentPage * pageSize, filteredStaff.length)}</strong> of{' '}
							<strong>{filteredStaff.length}</strong> staff members
						</span>
						<div class="flex items-center gap-1.5">
							<span>Per page:</span>
							<select
								bind:value={pageSize}
								onchange={() => (currentPage = 1)}
								class="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
							>
								<option value={10}>10</option>
								<option value={25}>25</option>
								<option value={50}>50</option>
								<option value={100}>100</option>
							</select>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 1}
							onclick={() => (currentPage = Math.max(1, currentPage - 1))}
							class="h-8 gap-1 px-3 text-xs"
						>
							<ChevronLeft class="h-3.5 w-3.5" />
							Previous
						</Button>
						<span class="px-2 text-xs font-medium text-muted-foreground">
							Page {currentPage} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage >= totalPages}
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							class="h-8 gap-1 px-3 text-xs"
						>
							Next
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</CardFooter>
			{/if}
		</Card>
	</div>
{/if}

<!-- Confirm Delete User Modal -->
<AlertDialog.Root bind:open={isDeleteDialogOpen}>
	<AlertDialog.Content class="max-w-md p-6">
		<AlertDialog.Header class="space-y-2">
			<AlertDialog.Title class="text-lg font-bold text-destructive">Remove Staff Member</AlertDialog.Title>
			<AlertDialog.Description class="text-xs leading-relaxed text-muted-foreground">
				Are you sure you want to remove <strong class="text-foreground">{userToDelete?.full_name || userToDelete?.email}</strong> from the system?
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="space-y-2 py-3">
			<Label for="del-password" class="text-xs font-medium">Enter your password to confirm</Label>
			<div class="relative">
				<Input
					id="del-password"
					type={showPassword ? 'text' : 'password'}
					placeholder="Confirm your password"
					bind:value={adminPassword}
					class="pr-10 text-xs"
				/>
				<button
					type="button"
					class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground focus:outline-none"
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<EyeOff class="h-3.5 w-3.5" />
					{:else}
						<Eye class="h-3.5 w-3.5" />
					{/if}
				</button>
			</div>
		</div>

		<AlertDialog.Footer class="mt-3 gap-2 sm:gap-2">
			<AlertDialog.Cancel class="h-9 px-3 text-xs" onclick={() => (isDeleteDialogOpen = false)}>
				Cancel
			</AlertDialog.Cancel>
			<Button
				variant="destructive"
				size="sm"
				class="h-9 px-3 text-xs"
				onclick={confirmDelete}
				disabled={!adminPassword}
			>
				Remove Member
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Confirm Role Update Modal -->
<AlertDialog.Root bind:open={isRoleUpdateOpen}>
	<AlertDialog.Content class="max-w-md p-6">
		<AlertDialog.Header class="space-y-2">
			<AlertDialog.Title class="text-lg font-bold">Update Role Permission</AlertDialog.Title>
			<AlertDialog.Description class="text-xs leading-relaxed text-muted-foreground">
				Change role to <strong class="font-semibold text-foreground uppercase">{roleUpdateData?.newRole}</strong>?
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="space-y-2 py-3">
			<Label for="role-password" class="text-xs font-medium">Enter your password to confirm</Label>
			<div class="relative">
				<Input
					id="role-password"
					type={showPassword ? 'text' : 'password'}
					placeholder="Confirm your password"
					bind:value={adminPassword}
					class="pr-10 text-xs"
				/>
				<button
					type="button"
					class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground focus:outline-none"
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<EyeOff class="h-3.5 w-3.5" />
					{:else}
						<Eye class="h-3.5 w-3.5" />
					{/if}
				</button>
			</div>
		</div>

		<AlertDialog.Footer class="mt-3 gap-2 sm:gap-2">
			<AlertDialog.Cancel class="h-9 px-3 text-xs" onclick={() => (isRoleUpdateOpen = false)}>
				Cancel
			</AlertDialog.Cancel>
			<Button
				size="sm"
				class="h-9 px-3 text-xs"
				onclick={confirmRoleUpdate}
				disabled={!adminPassword}
			>
				Confirm Role Change
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>


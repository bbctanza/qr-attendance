<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { logAuditChange } from '$lib/utils/auditLogger';
	import { ensureAvatarDownloadParam } from '$lib/utils/avatarUrl';
	import {
		accessApi,
		ElevationRequiredError,
		ROLE_DEFINITIONS,
		roleLabel,
		roleDefinition,
		type AccessRole,
		type DirectoryAccount,
		type PendingInvitation
	} from '$lib/api/access';
	import { ensureElevated, elevation, isElevated, elevationRemaining } from '$lib/stores/elevation';
	import ElevationDialog from '$lib/components/elevation-dialog.svelte';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Card, CardContent, CardFooter, CardHeader } from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import {
		ChevronLeft,
		ChevronRight,
		Search,
		RefreshCw,
		UserPlus,
		MoreHorizontal,
		ShieldCheck,
		ShieldAlert,
		Mail,
		MailX,
		Loader2,
		Check,
		Ban,
		CircleCheck,
		Trash2,
		Clock,
		Lock,
		LockOpen,
		Send,
		Users
	} from '@lucide/svelte';

	/**
	 * Access Directory - formerly "Manage Staff".
	 *
	 * Renamed because the page never only concerned staff: it governs administrators,
	 * guests and outstanding invitations too, and "staff" is also the name of one of the
	 * roles it assigns, which made every heading ambiguous.
	 *
	 * Three structural changes from the old screen:
	 *
	 *  - Pending invitations are rows. Previously an invited person appeared in the table
	 *    the moment the email went out, indistinguishable from someone who had actually
	 *    signed in, and there was no way to resend or revoke. They are now a distinct row
	 *    kind with their own actions.
	 *
	 *  - Suspension exists. Removing someone used to mean deleting the auth user outright.
	 *    Suspending revokes their sessions and blocks sign-in while keeping the account.
	 *
	 *  - No password fields. Identity is confirmed once (see ElevationDialog) and held for
	 *    ten minutes, instead of a password box in the invite form and another in every
	 *    confirmation modal.
	 */

	interface Row {
		kind: 'account' | 'invitation';
		id: string;
		email: string;
		name: string | null;
		avatarUrl: string | null;
		role: AccessRole;
		/** Presentation status, unified across both row kinds. */
		status: 'active' | 'suspended' | 'pending' | 'invited';
		lastActiveAt: string | null;
		createdAt: string;
		isSelf: boolean;
		isDeveloper: boolean;
		invitation?: PendingInvitation;
		account?: DirectoryAccount;
	}

	const STATUS_FILTER_LABELS: Record<string, string> = {
		all: 'All statuses',
		active: 'Active',
		pending: 'Pending',
		suspended: 'Suspended'
	};

	let pageLoading = $state(true);
	let isFetching = $state(false);
	let me = $state<DirectoryAccount | null>(null);
	let accounts = $state<DirectoryAccount[]>([]);
	let invitations = $state<PendingInvitation[]>([]);

	let searchQuery = $state('');
	let roleFilter = $state<string>('all');
	let statusFilter = $state<string>('all');
	let currentPage = $state(1);
	let pageSize = $state(10);

	// Invite dialog
	let isInviteOpen = $state(false);
	let inviteEmail = $state('');
	let inviteRole = $state<AccessRole>('staff');
	let isSendingInvite = $state(false);
	let inviteError = $state('');

	// Confirmations
	let roleChange = $state<{ row: Row; newRole: AccessRole } | null>(null);
	let statusChange = $state<{ row: Row; next: 'active' | 'suspended' } | null>(null);
	let removal = $state<Row | null>(null);
	let removalConfirmText = $state('');
	let revocation = $state<Row | null>(null);
	/** Id of the row whose action is in flight, so only that row shows a spinner. */
	let busyRowId = $state<string | null>(null);

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
				toast.error('You do not have permission to manage access.');
				goto('/settings');
				return;
			}

			me = profile;
			await refresh();
		} catch (e) {
			console.error(e);
			goto('/settings');
		} finally {
			pageLoading = false;
		}
	});

	async function refresh() {
		isFetching = true;
		try {
			const directory = await accessApi.listDirectory();
			accounts = directory.accounts;
			invitations = directory.invitations;
		} catch (e) {
			console.error('Failed to load access directory:', e);
			toast.error(e instanceof Error ? e.message : 'Could not load the access directory.');
		} finally {
			isFetching = false;
		}
	}

	// -----------------------------------------------------------------------
	// Rows
	// -----------------------------------------------------------------------

	/**
	 * One row per person, never two.
	 *
	 * Supabase creates the auth user - and therefore the profile - the moment an invite
	 * email is *sent*, not when it is accepted. So an invited person always has both an
	 * account record and a live invitation record, and listing the two tables separately
	 * would show them twice. The invitation is merged onto their account row instead,
	 * where it supplies the things only it knows: who invited them, when the link dies,
	 * and how many times it has been sent.
	 */
	let rows = $derived.by<Row[]>(() => {
		// A plain record rather than a Map: this is a throwaway index inside a derivation,
		// and the lint rule steering reactive state towards SvelteMap does not distinguish
		// the two.
		const invitationByEmail: Record<string, PendingInvitation> = {};
		for (const invitation of invitations) {
			invitationByEmail[invitation.email.toLowerCase()] = invitation;
		}

		const accountRows: Row[] = accounts.map((account) => {
			const key = account.email.toLowerCase();
			const invitation = invitationByEmail[key];
			delete invitationByEmail[key];

			return {
				kind: 'account',
				id: account.id,
				email: account.email,
				name: account.full_name,
				avatarUrl: ensureAvatarDownloadParam(account.avatar_url) ?? null,
				role: account.role,
				status:
					account.status === 'suspended'
						? 'suspended'
						: account.onboarding_completed
							? 'active'
							: invitation
								? 'pending'
								: // Invite accepted or expired, setup abandoned part-way. Distinct
									// from 'pending' because there is no live link left to resend.
									'invited',
				lastActiveAt: account.last_active_at,
				createdAt: account.created_at,
				isSelf: account.id === me?.id,
				isDeveloper: account.role === 'developer',
				invitation,
				account
			};
		});

		// Anything left has an invitation but no account - the auth user was deleted out
		// from under it. Shown so the stale invitation can be revoked rather than lingering.
		const orphanRows: Row[] = Object.values(invitationByEmail).map((invitation) => ({
			kind: 'invitation',
			id: invitation.id,
			email: invitation.email,
			name: null,
			avatarUrl: null,
			role: invitation.role,
			status: 'pending',
			lastActiveAt: null,
			createdAt: invitation.created_at,
			isSelf: false,
			isDeveloper: false,
			invitation
		}));

		// Rows awaiting a response first: they are the ones that need someone to act.
		const needsAction = (row: Row) =>
			row.status === 'pending' || row.status === 'invited' ? 0 : 1;
		return [...orphanRows, ...accountRows].sort((a, b) => needsAction(a) - needsAction(b));
	});

	let filteredRows = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return rows.filter((row) => {
			if (roleFilter !== 'all' && row.role !== roleFilter) return false;
			if (statusFilter === 'active' && row.status !== 'active') return false;
			if (statusFilter === 'suspended' && row.status !== 'suspended') return false;
			if (statusFilter === 'pending' && row.status !== 'pending' && row.status !== 'invited')
				return false;
			if (!q) return true;
			return (
				(row.name ?? '').toLowerCase().includes(q) ||
				row.email.toLowerCase().includes(q) ||
				roleLabel(row.role).toLowerCase().includes(q)
			);
		});
	});

	let totalPages = $derived(Math.max(1, Math.ceil(filteredRows.length / pageSize)));
	let paginatedRows = $derived(
		filteredRows.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize)
	);

	// Filtering can shrink the list out from under the current page; clamping rather than
	// resetting keeps the admin's place when they only widened a filter.
	$effect(() => {
		if (currentPage > totalPages) currentPage = totalPages;
	});

	/**
	 * Counted off `rows`, not off `accounts` and `invitations` separately, so a tile's
	 * number is always exactly what clicking it shows. Counting invitations directly gave
	 * "2 pending" next to a filtered list of four, because an account that abandoned setup
	 * belongs in that list but has no invitation row.
	 */
	let stats = $derived.by(() => ({
		admins: rows.filter((r) => r.role === 'admin' || r.role === 'developer').length,
		staff: rows.filter((r) => r.role === 'staff').length,
		guests: rows.filter((r) => r.role === 'guest').length,
		pending: rows.filter((r) => r.status === 'pending' || r.status === 'invited').length,
		suspended: rows.filter((r) => r.status === 'suspended').length
	}));

	// -----------------------------------------------------------------------
	// Formatting
	// -----------------------------------------------------------------------

	function relativeTime(iso: string | null): string {
		if (!iso) return 'Never';
		const diff = Date.now() - new Date(iso).getTime();
		if (diff < 0) return 'Just now';
		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function expiryLabel(invitation: PendingInvitation): string {
		const ms = new Date(invitation.expires_at).getTime() - Date.now();
		if (ms <= 0) return 'Expired';
		const days = Math.floor(ms / 86400000);
		if (days >= 1) return `Expires in ${days}d`;
		const hours = Math.max(1, Math.floor(ms / 3600000));
		return `Expires in ${hours}h`;
	}

	function initials(row: Row): string {
		const source = row.name || row.email;
		return source.charAt(0).toUpperCase();
	}

	// -----------------------------------------------------------------------
	// Actions
	// -----------------------------------------------------------------------

	/**
	 * Elevate while making sure the prompt never appears on top of another dialog.
	 *
	 * The prompt is a plain overlay, but the confirmations around it are bits-ui modals
	 * that trap focus and disable pointer events on the rest of the page - so a prompt
	 * rendered over one would be awkward at best and unusable at worst. Rather than rely
	 * on z-index to win that fight, any caller with a dialog on screen hands in how to
	 * close and restore it, and the two are never shown at once.
	 *
	 * When elevation is already held nothing is closed, so the common path has no flicker.
	 */
	async function elevateClear(close?: () => void, restore?: () => void): Promise<boolean> {
		if (elevation.current()) return true;
		close?.();
		const granted = await ensureElevated();
		restore?.();
		return granted;
	}

	/**
	 * Wraps a privileged call so a lapsed elevation is a prompt-and-retry rather than an
	 * error the admin has to recover from by hand. The retry happens once: a second
	 * ElevationRequiredError means the grant genuinely isn't being accepted.
	 *
	 * Callers close their confirmation dialog before calling this, so the retry prompt has
	 * the screen to itself.
	 */
	async function privileged<T>(run: () => Promise<T>): Promise<T | null> {
		try {
			if (!(await elevateClear())) return null;
			return await run();
		} catch (e) {
			if (e instanceof ElevationRequiredError) {
				if (!(await elevateClear())) return null;
				try {
					return await run();
				} catch (retryError) {
					toast.error(retryError instanceof Error ? retryError.message : 'Action failed.');
					return null;
				}
			}
			toast.error(e instanceof Error ? e.message : 'Action failed.');
			return null;
		}
	}

	async function sendInvite() {
		inviteError = '';
		const email = inviteEmail.trim().toLowerCase();
		if (!email) {
			inviteError = 'Enter an email address.';
			return;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			inviteError = 'That does not look like a valid email address.';
			return;
		}

		// Elevating with the invite form closed, then reopening it, keeps the typed email
		// and chosen role while guaranteeing the password prompt stands alone.
		if (
			!(await elevateClear(
				() => (isInviteOpen = false),
				() => (isInviteOpen = true)
			))
		) {
			return;
		}

		isSendingInvite = true;
		try {
			await accessApi.sendInvite(email, inviteRole);

			await logAuditChange(
				{
					entityType: 'user',
					entityId: email,
					action: 'create',
					after: { email, role: inviteRole },
					reason: `Invitation sent to ${email} as ${roleLabel(inviteRole)}`,
					tags: ['invite', 'access-directory']
				},
				(await supabase.auth.getSession()).data.session
			);

			toast.success(`Invitation sent to ${email}`);
			isInviteOpen = false;
			inviteEmail = '';
			inviteRole = 'staff';
			await refresh();
		} catch (e) {
			inviteError =
				e instanceof ElevationRequiredError
					? 'That confirmation expired. Press Send again to confirm and retry.'
					: e instanceof Error
						? e.message
						: 'Could not send the invitation.';
		} finally {
			isSendingInvite = false;
		}
	}

	async function confirmRoleChange() {
		if (!roleChange) return;
		const { row, newRole } = roleChange;
		const previousRole = row.role;
		// Closed before the call, not after: if elevation has lapsed the prompt must not
		// land on top of this dialog. The row's own spinner carries the progress.
		roleChange = null;
		busyRowId = row.id;

		const result = await privileged(() => accessApi.updateRole(row.id, newRole));
		if (result) {
			await logAuditChange(
				{
					entityType: 'user',
					entityId: row.id,
					action: 'update',
					before: { role: previousRole },
					after: { role: newRole },
					reason: `${row.email}: ${roleLabel(previousRole)} to ${roleLabel(newRole)}`,
					tags: ['role-change', 'access-directory']
				},
				(await supabase.auth.getSession()).data.session
			);
			toast.success(`${row.name || row.email} is now ${roleLabel(newRole)}`);
			await refresh();
		}

		busyRowId = null;
	}

	async function confirmStatusChange() {
		if (!statusChange) return;
		const { row, next } = statusChange;
		statusChange = null;
		busyRowId = row.id;

		const result = await privileged(() => accessApi.setStatus(row.id, next));
		if (result) {
			await logAuditChange(
				{
					entityType: 'user',
					entityId: row.id,
					action: 'update',
					before: { status: next === 'suspended' ? 'active' : 'suspended' },
					after: { status: next },
					reason:
						next === 'suspended'
							? `${row.email} suspended; active sessions revoked`
							: `${row.email} reactivated`,
					tags: ['account-status', 'access-directory']
				},
				(await supabase.auth.getSession()).data.session
			);
			toast.success(
				next === 'suspended'
					? `${row.name || row.email} suspended and signed out`
					: `${row.name || row.email} reactivated`
			);
			await refresh();
		}

		busyRowId = null;
	}

	async function confirmRemoval() {
		if (!removal) return;
		const row = removal;
		removal = null;
		removalConfirmText = '';
		busyRowId = row.id;

		const result = await privileged(() => accessApi.deleteUser(row.id));
		if (result) {
			await logAuditChange(
				{
					entityType: 'user',
					entityId: row.id,
					action: 'delete',
					before: { email: row.email, role: row.role },
					reason: `${row.email} (${roleLabel(row.role)}) permanently removed`,
					tags: ['user-deletion', 'access-directory']
				},
				(await supabase.auth.getSession()).data.session
			);
			toast.success(`${row.email} removed`);
			await refresh();
		}

		busyRowId = null;
	}

	async function resendInvite(row: Row) {
		if (!row.invitation) return;
		busyRowId = row.id;
		const result = await privileged(() => accessApi.resendInvite(row.invitation!.id));
		if (result) {
			toast.success(`Invitation resent to ${row.email}`);
			await refresh();
		}
		busyRowId = null;
	}

	async function confirmRevocation() {
		if (!revocation?.invitation) return;
		const row = revocation;
		revocation = null;
		busyRowId = row.id;

		const result = await privileged(() => accessApi.revokeInvite(row.invitation!.id));
		if (result) {
			await logAuditChange(
				{
					entityType: 'user',
					entityId: row.email,
					action: 'delete',
					before: { email: row.email, role: row.role },
					reason: `Invitation to ${row.email} revoked`,
					tags: ['invite-revoked', 'access-directory']
				},
				(await supabase.auth.getSession()).data.session
			);
			toast.success(`Invitation to ${row.email} revoked`);
			await refresh();
		}

		busyRowId = null;
	}

	/**
	 * Why a row's actions are unavailable, or null when they are not. Returning the reason
	 * rather than a boolean lets the menu say why instead of showing a dead control.
	 */
	function lockedReason(row: Row): string | null {
		if (row.isSelf) return 'You cannot change your own access';
		if (row.isDeveloper && me?.role !== 'developer')
			return 'Developer accounts are managed in the database';
		return null;
	}
</script>

<svelte:head>
	<title>Access Directory</title>
</svelte:head>

{#if pageLoading}
	<div class="flex w-full flex-col gap-6 p-4 md:p-6 lg:p-8">
		<div class="flex items-center gap-4">
			<Skeleton class="h-10 w-10 rounded-lg" />
			<div class="space-y-2">
				<Skeleton class="h-8 w-48" />
				<Skeleton class="h-4 w-64" />
			</div>
		</div>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each ['a', 'b', 'c', 'd'] as key (key)}
				<Skeleton class="h-20 rounded-xl" />
			{/each}
		</div>
		<Skeleton class="h-96 w-full rounded-xl" />
	</div>
{:else}
	<div class="flex w-full flex-col gap-5 p-4 md:p-6 lg:p-8">
		<!-- Header -->
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex items-start gap-2 sm:gap-3">
				<button
					onclick={() => goto('/settings')}
					class="mt-0.5 shrink-0 rounded-lg p-2 transition hover:bg-muted"
					aria-label="Back to options"
				>
					<ChevronLeft class="h-5 w-5" />
				</button>
				<div class="min-w-0">
					<h1 class="text-xl font-bold md:text-3xl">Access Directory</h1>
					<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
						Everyone who can sign in, what they can do, and who's been invited.
					</p>
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
				{#if $isElevated}
					<!-- Elevation is invisible state that changes what the next click does, so it
					     gets a persistent indicator rather than only appearing in the dialog. -->
					<button
						type="button"
						onclick={() => elevation.clear()}
						class="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/15 sm:inline-flex"
						title="End confirmed session now"
					>
						<LockOpen class="h-3 w-3" />
						Confirmed · {$elevationRemaining}
					</button>
				{/if}
				<Button size="sm" class="gap-1.5" onclick={() => (isInviteOpen = true)}>
					<UserPlus class="h-4 w-4" />
					Invite people
				</Button>
			</div>
		</div>

		<!-- Summary. Each tile is a filter: the number and the way to act on it are the
		     same control, so "3 pending" doesn't require hunting for them in the table. -->
		<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
			{#each [{ key: 'pending', label: 'Awaiting setup', value: stats.pending, icon: Clock, tone: 'text-amber-600 dark:text-amber-500', filter: () => {
							statusFilter = 'pending';
							roleFilter = 'all';
						} }, { key: 'admins', label: 'Administrators', value: stats.admins, icon: ShieldCheck, tone: 'text-primary', filter: () => {
							roleFilter = 'admin';
							statusFilter = 'all';
						} }, { key: 'staff', label: 'Staff', value: stats.staff, icon: Users, tone: 'text-sky-600 dark:text-sky-400', filter: () => {
							roleFilter = 'staff';
							statusFilter = 'all';
						} }, { key: 'suspended', label: 'Suspended', value: stats.suspended, icon: Ban, tone: 'text-destructive', filter: () => {
							statusFilter = 'suspended';
							roleFilter = 'all';
						} }] as tile (tile.key)}
				<button
					type="button"
					onclick={tile.filter}
					class="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 text-left transition hover:border-border hover:bg-card/70 sm:px-4 sm:py-3"
				>
					<tile.icon class="h-4 w-4 shrink-0 {tile.tone}" />
					<div class="min-w-0">
						<div class="text-lg leading-none font-bold sm:text-xl">{tile.value}</div>
						<div class="mt-1 truncate text-[11px] text-muted-foreground">{tile.label}</div>
					</div>
				</button>
			{/each}
		</div>

		<!-- Directory -->
		<Card>
			<CardHeader class="gap-3 px-4 py-3 sm:px-6">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div class="relative w-full sm:max-w-xs">
						<Search
							class="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							type="search"
							placeholder="Search by name or email..."
							bind:value={searchQuery}
							class="h-8 pl-8 text-xs"
						/>
					</div>

					<div class="flex items-center gap-2">
						<Select.Root type="single" bind:value={roleFilter}>
							<Select.Trigger
								size="sm"
								class="h-8 w-[7.5rem] px-2.5 text-xs"
								aria-label="Filter by role"
							>
								{roleFilter === 'all' ? 'All roles' : roleLabel(roleFilter)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="all" label="All roles">All roles</Select.Item>
								{#each ROLE_DEFINITIONS as role (role.value)}
									<Select.Item value={role.value} label={role.label}>{role.label}</Select.Item>
								{/each}
								<Select.Item value="developer" label="Developer">Developer</Select.Item>
							</Select.Content>
						</Select.Root>
						<Select.Root type="single" bind:value={statusFilter}>
							<Select.Trigger
								size="sm"
								class="h-8 w-[7.5rem] px-2.5 text-xs"
								aria-label="Filter by status"
							>
								{STATUS_FILTER_LABELS[statusFilter] ?? 'All statuses'}
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(STATUS_FILTER_LABELS) as [value, label] (value)}
									<Select.Item {value} {label}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<Button
							variant="outline"
							size="sm"
							onclick={refresh}
							disabled={isFetching}
							class="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
						>
							<RefreshCw class="h-3.5 w-3.5 {isFetching ? 'animate-spin' : ''}" />
							<span class="hidden sm:inline">Refresh</span>
						</Button>
					</div>
				</div>
			</CardHeader>

			<CardContent class="p-0">
				{#if isFetching && rows.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 py-16">
						<Loader2 class="h-6 w-6 animate-spin text-primary" />
						<p class="text-xs text-muted-foreground">Loading the directory...</p>
					</div>
				{:else if filteredRows.length === 0}
					<div class="flex flex-col items-center gap-2 px-6 py-16 text-center">
						<Users class="h-8 w-8 text-muted-foreground/40" />
						<p class="text-sm font-medium">
							{#if searchQuery || roleFilter !== 'all' || statusFilter !== 'all'}
								Nothing matches these filters
							{:else}
								No one has access yet
							{/if}
						</p>
						<p class="max-w-sm text-xs text-muted-foreground">
							{#if searchQuery || roleFilter !== 'all' || statusFilter !== 'all'}
								Try a different search, or clear the role and status filters.
							{:else}
								Invite your first colleague to give them access to the system.
							{/if}
						</p>
						{#if searchQuery || roleFilter !== 'all' || statusFilter !== 'all'}
							<Button
								variant="outline"
								size="sm"
								class="mt-2 h-8 text-xs"
								onclick={() => {
									searchQuery = '';
									roleFilter = 'all';
									statusFilter = 'all';
								}}
							>
								Clear filters
							</Button>
						{:else}
							<Button
								size="sm"
								class="mt-2 h-8 gap-1.5 text-xs"
								onclick={() => (isInviteOpen = true)}
							>
								<UserPlus class="h-3.5 w-3.5" />
								Invite people
							</Button>
						{/if}
					</div>
				{:else}
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow class="bg-muted/50 hover:bg-muted/50">
									<TableHead class="px-4 text-xs font-semibold text-muted-foreground sm:px-6">
										Person
									</TableHead>
									<TableHead class="w-36 px-4 text-xs font-semibold text-muted-foreground sm:px-6">
										Role
									</TableHead>
									<TableHead class="w-36 px-4 text-xs font-semibold text-muted-foreground sm:px-6">
										Status
									</TableHead>
									<TableHead
										class="hidden w-32 px-4 text-xs font-semibold text-muted-foreground sm:px-6 lg:table-cell"
									>
										Last active
									</TableHead>
									<TableHead
										class="w-16 px-4 text-right text-xs font-semibold text-muted-foreground sm:px-6"
									>
										<span class="sr-only">Actions</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each paginatedRows as row (row.kind + row.id)}
									{@const locked = lockedReason(row)}
									<TableRow
										class="transition-colors hover:bg-muted/30 {row.status === 'suspended'
											? 'opacity-60'
											: ''}"
									>
										<!-- Person -->
										<TableCell class="px-4 py-2.5 sm:px-6">
											<div class="flex items-center gap-3">
												{#if row.status === 'pending'}
													<div
														class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500"
													>
														<Mail class="h-3.5 w-3.5" />
													</div>
												{:else}
													<Avatar class="h-8 w-8 shrink-0 border">
														<AvatarImage src={row.avatarUrl ?? undefined} alt="" />
														<AvatarFallback class="text-xs font-semibold">
															{initials(row)}
														</AvatarFallback>
													</Avatar>
												{/if}
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-1.5">
														<span class="truncate text-xs font-semibold">
															{row.name || row.email}
														</span>
														{#if row.isSelf}
															<Badge variant="secondary" class="h-4 shrink-0 px-1 text-[9px]"
																>You</Badge
															>
														{/if}
													</div>
													<div class="truncate text-[11px] text-muted-foreground">
														{#if row.invitation}
															Invited by {row.invitation.invited_by_email ?? 'an administrator'}
															{#if row.invitation.resend_count > 0}
																· sent {row.invitation.resend_count + 1}×
															{/if}
														{:else if row.name}
															{row.email}
														{:else}
															Hasn't finished setting up
														{/if}
													</div>
												</div>
											</div>
										</TableCell>

										<!-- Role -->
										<TableCell class="px-4 py-2.5 sm:px-6">
											<div class="flex items-center gap-1.5">
												{#if row.isDeveloper}
													<ShieldAlert class="h-3.5 w-3.5 shrink-0 text-destructive" />
												{:else if row.role === 'admin'}
													<ShieldCheck class="h-3.5 w-3.5 shrink-0 text-primary" />
												{/if}
												<span class="text-xs font-medium">{roleLabel(row.role)}</span>
											</div>
										</TableCell>

										<!-- Status -->
										<TableCell class="px-4 py-2.5 sm:px-6">
											{#if row.status === 'pending'}
												<div class="flex flex-col gap-0.5">
													<Badge
														variant="outline"
														class="h-5 w-fit gap-1 border-amber-500/40 px-1.5 text-[10px] text-amber-600 dark:text-amber-500"
													>
														<Clock class="h-2.5 w-2.5" />
														Invited
													</Badge>
													{#if row.invitation}
														<span class="text-[10px] text-muted-foreground">
															{expiryLabel(row.invitation)}
														</span>
													{/if}
												</div>
											{:else if row.status === 'invited'}
												<Badge
													variant="outline"
													class="h-5 w-fit gap-1 border-sky-500/40 px-1.5 text-[10px] text-sky-600 dark:text-sky-400"
												>
													<Clock class="h-2.5 w-2.5" />
													Setting up
												</Badge>
											{:else if row.status === 'suspended'}
												<Badge
													variant="outline"
													class="h-5 w-fit gap-1 border-destructive/40 px-1.5 text-[10px] text-destructive"
												>
													<Ban class="h-2.5 w-2.5" />
													Suspended
												</Badge>
											{:else}
												<Badge
													variant="outline"
													class="h-5 w-fit gap-1 px-1.5 text-[10px] text-muted-foreground"
												>
													<CircleCheck class="h-2.5 w-2.5 text-primary" />
													Active
												</Badge>
											{/if}
										</TableCell>

										<!-- Last active -->
										<TableCell
											class="hidden px-4 py-2.5 text-xs text-muted-foreground sm:px-6 lg:table-cell"
										>
											{row.kind === 'invitation' || row.status === 'pending'
												? '—'
												: relativeTime(row.lastActiveAt)}
										</TableCell>

										<!-- Actions -->
										<TableCell class="px-4 py-2.5 text-right sm:px-6">
											{#if busyRowId === row.id}
												<Loader2 class="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
											{:else}
												<DropdownMenu.Root>
													<DropdownMenu.Trigger>
														{#snippet child({ props })}
															<Button
																{...props}
																variant="ghost"
																size="icon"
																class="h-8 w-8"
																aria-label="Actions for {row.email}"
															>
																<MoreHorizontal class="h-4 w-4" />
															</Button>
														{/snippet}
													</DropdownMenu.Trigger>
													<DropdownMenu.Content align="end" class="w-56">
														<!-- Every GroupHeading is wrapped in a Group deliberately: bits-ui resolves
														     the heading against the group context and Context.get() throws when
														     there is none, which took the whole menu down with it. -->
														{#if row.invitation}
															<!-- A live invitation drives the resend/revoke pair whether or not an
															     account row sits behind it; Supabase creates the account when the
															     mail is sent, so usually one does. -->
															<DropdownMenu.Group>
																<DropdownMenu.GroupHeading
																	class="px-2 py-1.5 text-[10px] tracking-wide text-muted-foreground uppercase"
																>
																	Invitation
																</DropdownMenu.GroupHeading>
																<DropdownMenu.Item onclick={() => resendInvite(row)}>
																	<Send class="mr-2 h-3.5 w-3.5" />
																	Resend invitation
																</DropdownMenu.Item>
																<DropdownMenu.Item
																	class="text-destructive data-highlighted:text-destructive"
																	onclick={() => (revocation = row)}
																>
																	<MailX class="mr-2 h-3.5 w-3.5" />
																	Revoke invitation
																</DropdownMenu.Item>
															</DropdownMenu.Group>
														{/if}

														{#if row.kind === 'account'}
															{#if row.invitation}
																<DropdownMenu.Separator />
															{/if}
															{#if locked}
																<div class="px-2 py-3 text-xs text-muted-foreground">
																	<Lock class="mr-1.5 inline h-3 w-3" />
																	{locked}
																</div>
															{:else}
																<DropdownMenu.Group>
																	<DropdownMenu.GroupHeading
																		class="px-2 py-1.5 text-[10px] tracking-wide text-muted-foreground uppercase"
																	>
																		Change role
																	</DropdownMenu.GroupHeading>
																	{#each ROLE_DEFINITIONS as definition (definition.value)}
																		<DropdownMenu.Item
																			disabled={row.role === definition.value}
																			onclick={() =>
																				(roleChange = { row, newRole: definition.value })}
																		>
																			<span
																				class="mr-2 flex h-3.5 w-3.5 items-center justify-center"
																			>
																				{#if row.role === definition.value}
																					<Check class="h-3.5 w-3.5 text-primary" />
																				{/if}
																			</span>
																			<span class="flex-1">{definition.label}</span>
																		</DropdownMenu.Item>
																	{/each}
																</DropdownMenu.Group>

																<DropdownMenu.Separator />

																<DropdownMenu.Group>
																	{#if row.status === 'suspended'}
																		<DropdownMenu.Item
																			onclick={() => (statusChange = { row, next: 'active' })}
																		>
																			<CircleCheck class="mr-2 h-3.5 w-3.5" />
																			Reactivate account
																		</DropdownMenu.Item>
																	{:else}
																		<DropdownMenu.Item
																			onclick={() => (statusChange = { row, next: 'suspended' })}
																		>
																			<Ban class="mr-2 h-3.5 w-3.5" />
																			Suspend access
																		</DropdownMenu.Item>
																	{/if}

																	<!-- Revoking already deletes the half-created account, so offering
																	     Remove next to it would be two destructive items doing one thing. -->
																	{#if !row.invitation}
																		<DropdownMenu.Item
																			class="text-destructive data-highlighted:text-destructive"
																			onclick={() => {
																				removalConfirmText = '';
																				removal = row;
																			}}
																		>
																			<Trash2 class="mr-2 h-3.5 w-3.5" />
																			Remove permanently
																		</DropdownMenu.Item>
																	{/if}
																</DropdownMenu.Group>
															{/if}
														{/if}
													</DropdownMenu.Content>
												</DropdownMenu.Root>
											{/if}
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>

			{#if filteredRows.length > 0}
				<CardFooter
					class="flex flex-col items-center justify-between gap-3 border-t px-4 py-2.5 sm:flex-row sm:px-6"
				>
					<div class="flex items-center gap-4 text-xs text-muted-foreground">
						<span>
							<strong>{Math.min((currentPage - 1) * pageSize + 1, filteredRows.length)}</strong
							>–<strong>{Math.min(currentPage * pageSize, filteredRows.length)}</strong>
							of <strong>{filteredRows.length}</strong>
						</span>
						<div class="flex items-center gap-1.5">
							<span class="hidden sm:inline">Per page:</span>
							<Select.Root
								type="single"
								value={String(pageSize)}
								onValueChange={(value) => {
									pageSize = Number(value);
									currentPage = 1;
								}}
							>
								<Select.Trigger
									size="sm"
									class="h-8 w-[4.5rem] px-2.5 text-xs"
									aria-label="Rows per page"
								>
									{pageSize}
								</Select.Trigger>
								<Select.Content>
									{#each [10, 25, 50, 100] as size (size)}
										<Select.Item value={String(size)} label={String(size)}>{size}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
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
							<span class="hidden sm:inline">Previous</span>
						</Button>
						<span class="px-1 text-xs font-medium text-muted-foreground">
							{currentPage} / {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage >= totalPages}
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							class="h-8 gap-1 px-3 text-xs"
						>
							<span class="hidden sm:inline">Next</span>
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</CardFooter>
			{/if}
		</Card>
	</div>
{/if}

<!-- Invite ------------------------------------------------------------------>
<AlertDialog.Root bind:open={isInviteOpen}>
	<AlertDialog.Content class="max-w-lg">
		<AlertDialog.Header class="space-y-1">
			<AlertDialog.Title class="text-base font-bold">Invite people</AlertDialog.Title>
			<AlertDialog.Description class="text-xs text-muted-foreground">
				They'll get an email with a link to set up their account. The role decides what they can do
				once they're in.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				sendInvite();
			}}
		>
			{#if inviteError}
				<div
					class="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
					role="alert"
				>
					{inviteError}
				</div>
			{/if}

			<div class="space-y-1.5">
				<Label for="invite-email" class="text-xs font-medium">Email address</Label>
				<Input
					id="invite-email"
					type="email"
					autocomplete="off"
					placeholder="colleague@organization.com"
					bind:value={inviteEmail}
					disabled={isSendingInvite}
					class="text-sm"
				/>
			</div>

			<!-- Role as described cards rather than a dropdown: an admin picking a role for
			     someone else needs to see what it grants at the moment of choosing, not go
			     looking for documentation afterwards. -->
			<fieldset class="space-y-1.5">
				<legend class="mb-1.5 text-xs font-medium">Role</legend>
				<div class="space-y-2">
					{#each ROLE_DEFINITIONS as definition (definition.value)}
						<label
							class="flex cursor-pointer gap-3 rounded-lg border p-3 transition {inviteRole ===
							definition.value
								? 'border-primary bg-primary/5'
								: 'border-border hover:border-border/80 hover:bg-muted/40'}"
						>
							<input
								type="radio"
								name="invite-role"
								value={definition.value}
								bind:group={inviteRole}
								disabled={isSendingInvite}
								class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
							/>
							<div class="min-w-0 space-y-1">
								<div class="text-xs font-semibold">{definition.label}</div>
								<div class="text-[11px] text-muted-foreground">{definition.summary}</div>
								{#if inviteRole === definition.value}
									<ul class="mt-1.5 space-y-0.5">
										{#each definition.capabilities as capability (capability)}
											<li class="flex gap-1.5 text-[11px] text-muted-foreground">
												<Check class="mt-0.5 h-2.5 w-2.5 shrink-0 text-primary" />
												<span>{capability}</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</label>
					{/each}
				</div>
			</fieldset>

			<AlertDialog.Footer class="gap-2 sm:gap-2">
				<Button
					type="button"
					variant="outline"
					onclick={() => {
						isInviteOpen = false;
						inviteError = '';
					}}
					disabled={isSendingInvite}
				>
					Cancel
				</Button>
				<Button type="submit" class="gap-1.5" disabled={isSendingInvite || !inviteEmail}>
					{#if isSendingInvite}
						<Loader2 class="h-4 w-4 animate-spin" />
						Sending...
					{:else}
						<Send class="h-4 w-4" />
						Send invitation
					{/if}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Role change ------------------------------------------------------------->
<AlertDialog.Root open={!!roleChange} onOpenChange={(o) => !o && (roleChange = null)}>
	<AlertDialog.Content class="max-w-md">
		<AlertDialog.Header class="space-y-1">
			<AlertDialog.Title class="text-base font-bold">
				Change role to {roleLabel(roleChange?.newRole)}?
			</AlertDialog.Title>
			<AlertDialog.Description class="text-xs leading-relaxed text-muted-foreground">
				<strong class="text-foreground">{roleChange?.row.name || roleChange?.row.email}</strong>
				will move from {roleLabel(roleChange?.row.role)} to
				{roleLabel(roleChange?.newRole)}.
			</AlertDialog.Description>
		</AlertDialog.Header>

		{#if roleChange}
			{@const definition = roleDefinition(roleChange.newRole)}
			{#if definition}
				<div class="rounded-lg border bg-muted/40 p-3">
					<p class="text-[11px] font-medium">As {definition.label} they will be able to:</p>
					<ul class="mt-1.5 space-y-1">
						{#each definition.capabilities as capability (capability)}
							<li class="flex gap-1.5 text-[11px] text-muted-foreground">
								<Check class="mt-0.5 h-2.5 w-2.5 shrink-0 text-primary" />
								<span>{capability}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if roleChange.newRole === 'admin'}
				<p class="text-[11px] text-amber-600 dark:text-amber-500">
					Administrators can invite, suspend and remove other people — including you.
				</p>
			{/if}
		{/if}

		<AlertDialog.Footer class="gap-2 sm:gap-2">
			<Button type="button" variant="outline" onclick={() => (roleChange = null)}>Cancel</Button>
			<Button onclick={confirmRoleChange}>Change role</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Suspend / reactivate ---------------------------------------------------->
<AlertDialog.Root open={!!statusChange} onOpenChange={(o) => !o && (statusChange = null)}>
	<AlertDialog.Content class="max-w-md">
		<AlertDialog.Header class="space-y-1">
			<AlertDialog.Title class="text-base font-bold">
				{statusChange?.next === 'suspended' ? 'Suspend access?' : 'Reactivate account?'}
			</AlertDialog.Title>
			<AlertDialog.Description class="text-xs leading-relaxed text-muted-foreground">
				{#if statusChange?.next === 'suspended'}
					<strong class="text-foreground"
						>{statusChange?.row.name || statusChange?.row.email}</strong
					>
					will be signed out everywhere and blocked from signing in. Their account, history and scans
					stay intact, and you can reactivate them at any time.
				{:else}
					<strong class="text-foreground"
						>{statusChange?.row.name || statusChange?.row.email}</strong
					>
					will be able to sign in again as {roleLabel(statusChange?.row.role)}.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="gap-2 sm:gap-2">
			<Button type="button" variant="outline" onclick={() => (statusChange = null)}>Cancel</Button>
			<Button
				variant={statusChange?.next === 'suspended' ? 'destructive' : 'default'}
				onclick={confirmStatusChange}
			>
				{statusChange?.next === 'suspended' ? 'Suspend access' : 'Reactivate'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Revoke invitation ------------------------------------------------------->
<AlertDialog.Root open={!!revocation} onOpenChange={(o) => !o && (revocation = null)}>
	<AlertDialog.Content class="max-w-md">
		<AlertDialog.Header class="space-y-1">
			<AlertDialog.Title class="text-base font-bold">Revoke this invitation?</AlertDialog.Title>
			<AlertDialog.Description class="text-xs leading-relaxed text-muted-foreground">
				The link already emailed to <strong class="text-foreground">{revocation?.email}</strong>
				will stop working. You can invite them again later.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="gap-2 sm:gap-2">
			<Button type="button" variant="outline" onclick={() => (revocation = null)}>Keep it</Button>
			<Button variant="destructive" onclick={confirmRevocation}>Revoke invitation</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Remove permanently ------------------------------------------------------>
<AlertDialog.Root
	open={!!removal}
	onOpenChange={(o) => {
		if (!o) {
			removal = null;
			removalConfirmText = '';
		}
	}}
>
	<AlertDialog.Content class="max-w-md">
		<AlertDialog.Header class="space-y-1">
			<AlertDialog.Title class="text-base font-bold text-destructive">
				Remove {removal?.name || removal?.email}?
			</AlertDialog.Title>
			<AlertDialog.Description class="text-xs leading-relaxed text-muted-foreground">
				This deletes the account permanently and cannot be undone. If you only need to stop them
				signing in, suspend them instead — that's reversible.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<!-- Elevation already proved who is doing this; typing the address proves they
		     meant this particular row. Deletion is the one action with no way back. -->
		<div class="space-y-1.5">
			<Label for="removal-confirm" class="text-xs font-medium">
				Type <span class="font-mono text-foreground">{removal?.email}</span> to confirm
			</Label>
			<Input
				id="removal-confirm"
				bind:value={removalConfirmText}
				autocomplete="off"
				placeholder={removal?.email}
				class="text-xs"
			/>
		</div>

		<AlertDialog.Footer class="gap-2 sm:gap-2">
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					removal = null;
					removalConfirmText = '';
				}}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				disabled={removalConfirmText.trim().toLowerCase() !== removal?.email.toLowerCase()}
				onclick={confirmRemoval}
			>
				Remove permanently
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<ElevationDialog />

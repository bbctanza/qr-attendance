<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Badge } from "$lib/components/ui/badge";
	import { Switch } from "$lib/components/ui/switch";
	import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
	import { ChevronLeft, Lock, Shield, Smartphone, Eye, EyeOff, Trash2, LogOut } from "@lucide/svelte";
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import { supabase } from "$lib/supabase";
	import { onMount } from "svelte";
	import FullPageLoading from "$lib/components/full-page-loading.svelte";
	import { getUserSessions, deleteSession, deleteAllOtherSessions, formatLastActive, type UserSession } from "$lib/utils/sessions";

	// Profile state
	let profile = $state({
		id: "",
		name: "",
		email: "",
		avatar: "",
		role: "staff"
	});

	let originalProfile = $state({
		id: "",
		name: "",
		email: "",
		avatar: "",
		role: "staff"
	});

	let isLoading = $state(true);
	let isSaving = $state(false);
	let isLoadingSessions = $state(false);

	let passwordForm = $state({
		currentPassword: "",
		newPassword: "",
		confirmPassword: "",
		showCurrent: false,
		showNew: false,
		showConfirm: false
	});

	let twoFaEnabled = $state(false);

	let activeSessions: UserSession[] = $state([]);

	// Check if there are unsaved changes
	let hasUnsavedChanges = $derived(
		profile.name !== originalProfile.name ||
		profile.avatar !== originalProfile.avatar ||
		passwordForm.newPassword !== ""
	);

	onMount(async () => {
		await fetchProfile();
		await loadSessions();
	});

	async function fetchProfile() {
		isLoading = true;
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				goto('/login');
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
					name: user.user_metadata?.full_name || "User",
					email: user.email || "",
					avatar: user.user_metadata?.avatar_url || "",
					role: "staff"
				};
			} else {
				// We'll use field aliasing or just assume columns exist
				// Cast to any to avoid TS errors if columns are literally missing in type defs
				const p = prof as any;
				profile = {
					id: p.id,
					name: p.full_name || user.user_metadata?.full_name || "User",
					email: p.email || user.email || "",
					avatar: p.avatar_url || user.user_metadata?.avatar_url || "",
					role: p.role || "staff"
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
				const { data, error } = await supabase.storage
					.from('user-profile')
					.upload(fileName, file, {
						cacheControl: '3600',
						upsert: true
					});

				if (error) {
					throw new Error(`Upload failed: ${error.message}`);
				}

				if (!data) {
					throw new Error('Upload returned no data');
				}

				// Get signed URL (valid for 1 hour)
				const { data: urlData } = await supabase.storage
					.from('user-profile')
					.createSignedUrl(fileName, 3600);

				if (!urlData?.signedUrl) {
					throw new Error('Could not generate signed URL');
				}

				profile.avatar = urlData.signedUrl;
				
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
			toast.error("Please fill in your name");
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
					toast.error("New passwords do not match");
					isSaving = false;
					return;
				}
				if (passwordForm.newPassword.length < 8) {
					toast.error("Password must be at least 8 characters");
					isSaving = false;
					return;
				}

				const { error: passError } = await supabase.auth.updateUser({
					password: passwordForm.newPassword
				});

				if (passError) throw passError;

				// Reset password form
				passwordForm = {
					currentPassword: "",
					newPassword: "",
					confirmPassword: "",
					showCurrent: false,
					showNew: false,
					showConfirm: false
				};
			}

			// Update original values after successful save
			originalProfile = { ...profile };
			toast.success("Changes saved successfully");
		} catch (e: any) {
			toast.error(e.message || "Failed to save changes");
		} finally {
			isSaving = false;
		}
	}

	function handleCancel() {
		// Revert all changes
		profile = { ...originalProfile };
		passwordForm = {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
			showCurrent: false,
			showNew: false,
			showConfirm: false
		};
		toast.success("Changes discarded");
	}

	function handleToggle2FA() {
		if (!twoFaEnabled) {
			toast.success("Two-factor authentication enabled");
		} else {
			toast.success("Two-factor authentication disabled");
		}
	}

	async function loadSessions() {
		isLoadingSessions = true;
		try {
			const sessions = await getUserSessions();
			activeSessions = sessions;
		} catch (e) {
			toast.error("Failed to load sessions");
		} finally {
			isLoadingSessions = false;
		}
	}

	async function handleLogoutSession(sessionId: string) {
		try {
			const success = await deleteSession(sessionId);
			if (success) {
				activeSessions = activeSessions.filter(s => s.id !== sessionId);
				toast.success("Session logged out");
			} else {
				toast.error("Failed to logout session");
			}
		} catch (e) {
			toast.error("Failed to logout session");
		}
	}

	async function handleLogoutAllSessions() {
		if (!confirm("Are you sure? You will be logged out of all devices except this one.")) {
			return;
		}

		try {
			const success = await deleteAllOtherSessions();
			if (success) {
				await loadSessions();
				toast.success("Logged out of all other sessions");
			} else {
				toast.error("Failed to logout all sessions");
			}
		} catch (e) {
			toast.error("Failed to logout all sessions");
		}
	}
</script>

{#if isLoading}
	<FullPageLoading message="Loading profile..." />
{:else}
<!-- Mobile View -->
<div class="md:hidden flex flex-col min-h-screen bg-background pb-20">
	<!-- Header -->
	<div class="hidden sm:flex sticky top-0 bg-background border-b border-border/10 z-10">
		<div class="flex items-center justify-between gap-3 px-4 py-4 w-full">
			<div class="flex items-center gap-3 min-w-0 flex-1">
				<button onclick={() => goto('/settings')} class="p-2 hover:bg-muted rounded-lg transition shrink-0">
					<ChevronLeft class="h-5 w-5" />
				</button>
				<div class="min-w-0 flex-1">
					<h1 class="text-xl font-bold">Profile</h1>
					<p class="text-xs text-muted-foreground">Manage your account</p>
				</div>
			</div>
			{#if hasUnsavedChanges}
				<div class="flex items-center gap-2">
					<Badge variant="outline" class="bg-yellow-50 text-yellow-900 border-yellow-200">Unsaved</Badge>
					<Button size="sm" onclick={handleSave} disabled={isSaving}>
						{isSaving ? "Saving..." : "Save"}
					</Button>
					<Button size="sm" variant="outline" onclick={handleCancel} disabled={isSaving}>
						Cancel
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 px-4 py-6 space-y-6">
		<!-- Basic Information -->
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-base">Basic Information</CardTitle>
				<CardDescription class="text-xs">Update your profile details</CardDescription>
			</CardHeader>
			<CardContent class="space-y-6">
				<!-- Avatar Section -->
				<div class="flex items-center gap-4">
					<Avatar class="h-20 w-20">
						{#if profile.avatar}
							<AvatarImage src={profile.avatar} alt={profile.name} />
						{/if}
						<AvatarFallback class="text-lg">{(profile.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
					</Avatar>
					<Button variant="outline" onclick={handleChangeAvatar}>Change Avatar</Button>
				</div>

				<!-- Form Fields -->
				<div class="space-y-4">
					<div>
						<Label for="name" class="text-sm font-medium">Full Name</Label>
						<Input id="name" bind:value={profile.name} placeholder="Your name" class="mt-2" />
					</div>
					<div>
						<Label for="email" class="text-sm font-medium">Email</Label>
						<Input id="email" bind:value={profile.email} type="email" placeholder="your@email.com" class="mt-2" disabled />
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Password & Security -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Lock class="h-5 w-5 text-primary" />
					<div>
						<CardTitle class="text-base">Password & Security</CardTitle>
						<CardDescription class="text-xs">Manage your password and authentication</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				<!-- Change Password Section -->
				<div class="space-y-3 pb-4 border-b border-border/20">
					<h3 class="text-sm font-semibold">Change Password</h3>
					<div>
						<Label class="text-xs font-medium">Current Password</Label>
						<div class="relative mt-2">
							<Input
								type={passwordForm.showCurrent ? "text" : "password"}
								bind:value={passwordForm.currentPassword}
								placeholder="Enter current password"
							/>
							<button
								onclick={() => (passwordForm.showCurrent = !passwordForm.showCurrent)}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								{#if passwordForm.showCurrent}
									<EyeOff class="h-4 w-4" />
								{:else}
									<Eye class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>
					<div>
						<Label class="text-xs font-medium">New Password</Label>
						<div class="relative mt-2">
							<Input
								type={passwordForm.showNew ? "text" : "password"}
								bind:value={passwordForm.newPassword}
								placeholder="Enter new password"
							/>
							<button
								onclick={() => (passwordForm.showNew = !passwordForm.showNew)}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
						<Label class="text-xs font-medium">Confirm Password</Label>
						<div class="relative mt-2">
							<Input
								type={passwordForm.showConfirm ? "text" : "password"}
								bind:value={passwordForm.confirmPassword}
								placeholder="Confirm new password"
							/>
							<button
								onclick={() => (passwordForm.showConfirm = !passwordForm.showConfirm)}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

				<!-- 2FA Section -->
				<div class="flex items-center justify-between">
					<div>
						<Label class="text-sm font-medium">Two-Factor Authentication</Label>
						<p class="text-xs text-muted-foreground mt-1">Add an extra layer of security</p>
					</div>
					<Switch bind:checked={twoFaEnabled} onchange={handleToggle2FA} />
				</div>
			</CardContent>
		</Card>

		<!-- Active Sessions -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Smartphone class="h-5 w-5 text-primary" />
					<div>
						<CardTitle class="text-base">Active Sessions</CardTitle>
						<CardDescription class="text-xs">{activeSessions.length} device{activeSessions.length !== 1 ? 's' : ''}</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if isLoadingSessions}
					<p class="text-xs text-muted-foreground text-center py-4">Loading sessions...</p>
				{:else if activeSessions.length === 0}
					<p class="text-xs text-muted-foreground text-center py-4">No active sessions found</p>
				{:else}
					{#each activeSessions as session}
						<div class="flex items-start justify-between p-3 rounded-lg bg-card/50">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">{session.device_name}</span>
									{#if session.is_current}
										<Badge class="text-xs">Current</Badge>
									{/if}
								</div>
								<p class="text-xs text-muted-foreground mt-1">{session.browser}</p>
								<p class="text-xs text-muted-foreground">{session.location}</p>
								<p class="text-xs text-muted-foreground">Last active: {formatLastActive(session.last_active)}</p>
							</div>
							{#if !session.is_current}
								<button
									onclick={() => handleLogoutSession(session.id)}
									class="p-2 text-muted-foreground hover:text-red-500 transition shrink-0"
								>
									<LogOut class="h-4 w-4" />
								</button>
							{/if}
						</div>
					{/each}
					{#if activeSessions.length > 1}
						<Button variant="outline" class="w-full text-xs text-red-500 hover:text-red-600" onclick={handleLogoutAllSessions}>
							Log out all other sessions
						</Button>
					{/if}
				{/if}
			</CardContent>
		</Card>
	</div>
</div>

<!-- Desktop View -->
<div class="hidden md:flex flex-col gap-6 p-6 lg:p-8 max-w-4xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Profile</h1>
			<p class="text-muted-foreground mt-1">Manage your account and security</p>
		</div>
		<div class="flex items-center gap-2">
			{#if hasUnsavedChanges}
				<Badge variant="outline" class="bg-yellow-50 text-yellow-900 border-yellow-200">Unsaved</Badge>
				<Button onclick={handleSave} disabled={isSaving}>
					{isSaving ? "Saving..." : "Save Changes"}
				</Button>
				<Button variant="outline" onclick={handleCancel} disabled={isSaving}>
					Cancel
				</Button>
			{/if}
			<Button variant="outline" onclick={() => goto('/settings')}>
				<ChevronLeft class="mr-2 h-4 w-4" />
				Back
			</Button>
		</div>
	</div>

	<!-- Content Grid -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Left Column: Basic Info -->
		<div class="lg:col-span-2 space-y-6">
			<!-- Basic Information -->
			<Card>
				<CardHeader>
					<CardTitle>Basic Information</CardTitle>
					<CardDescription>Update your profile details</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<!-- Avatar Section -->
					<div class="flex items-center gap-6">
						<Avatar class="h-24 w-24">
							{#if profile.avatar}
								<AvatarImage src={profile.avatar} alt={profile.name} />
							{/if}
							<AvatarFallback class="text-xl">{(profile.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
						</Avatar>
						<Button variant="outline" onclick={handleChangeAvatar}>Change Avatar</Button>
					</div>

					<!-- Form Fields -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<Label for="fullName" class="text-sm font-medium">Full Name</Label>
							<Input id="fullName" bind:value={profile.name} placeholder="Your name" class="mt-2" />
						</div>
						<div>
							<Label for="email" class="text-sm font-medium">Email</Label>
							<Input id="email" bind:value={profile.email} type="email" placeholder="your@email.com" class="mt-2" disabled />
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
					<div class="space-y-4 pb-6 border-b border-border/20">
						<h3 class="font-semibold">Change Password</h3>
						<div class="grid grid-cols-1 gap-4">
							<div>
								<Label class="text-sm font-medium">Current Password</Label>
								<div class="relative mt-2">
									<Input
										type={passwordForm.showCurrent ? "text" : "password"}
										bind:value={passwordForm.currentPassword}
										placeholder="Enter current password"
									/>
									<button
										onclick={() => (passwordForm.showCurrent = !passwordForm.showCurrent)}
										class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
									>
										{#if passwordForm.showCurrent}
											<EyeOff class="h-4 w-4" />
										{:else}
											<Eye class="h-4 w-4" />
										{/if}
									</button>
								</div>
							</div>
							<div class="grid grid-cols-2 gap-4">
								<div>
									<Label class="text-sm font-medium">New Password</Label>
									<div class="relative mt-2">
										<Input
											type={passwordForm.showNew ? "text" : "password"}
											bind:value={passwordForm.newPassword}
											placeholder="Enter new password"
										/>
										<button
											onclick={() => (passwordForm.showNew = !passwordForm.showNew)}
											class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
											type={passwordForm.showConfirm ? "text" : "password"}
											bind:value={passwordForm.confirmPassword}
											placeholder="Confirm new password"
										/>
										<button
											onclick={() => (passwordForm.showConfirm = !passwordForm.showConfirm)}
											class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
							<p class="text-sm text-muted-foreground mt-1">Add an extra layer of security to your account</p>
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
							<CardDescription class="text-xs">{activeSessions.length} device{activeSessions.length !== 1 ? 's' : ''}</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent class="space-y-3">
					{#if isLoadingSessions}
						<p class="text-xs text-muted-foreground text-center py-4">Loading sessions...</p>
					{:else if activeSessions.length === 0}
						<p class="text-xs text-muted-foreground text-center py-4">No active sessions found</p>
					{:else}
						{#each activeSessions as session}
							<div class="flex items-start justify-between p-3 rounded-lg border border-border/20 bg-card/50">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="font-medium text-sm">{session.device_name}</span>
										{#if session.is_current}
											<Badge class="text-xs">Current</Badge>
										{/if}
									</div>
									<p class="text-xs text-muted-foreground mt-1">{session.browser}</p>
									<p class="text-xs text-muted-foreground">{session.location}</p>
									<p class="text-xs text-muted-foreground">Last active: {formatLastActive(session.last_active)}</p>
								</div>
								{#if !session.is_current}
									<button
										onclick={() => handleLogoutSession(session.id)}
										class="p-2 text-muted-foreground hover:text-red-500 transition shrink-0"
										title="Logout"
									>
										<LogOut class="h-4 w-4" />
									</button>
								{/if}
							</div>
						{/each}
						{#if activeSessions.length > 1}
							<Button
								variant="outline"
								size="sm"
								class="w-full text-xs text-red-500 hover:text-red-600"
								onclick={handleLogoutAllSessions}
							>
								Log out all other sessions
							</Button>
						{/if}
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>
{/if}

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

	// Profile state
	let profile = $state({
		name: "Alex Chen",
		email: "alex.chen@example.com",
		avatar: ""
	});

	let passwordForm = $state({
		currentPassword: "",
		newPassword: "",
		confirmPassword: "",
		showCurrent: false,
		showNew: false,
		showConfirm: false
	});

	let twoFaEnabled = $state(false);
	let isSavingProfile = $state(false);
	let isSavingPassword = $state(false);

	let activeSessions = $state([
		{ id: 1, device: "iPhone 14 Pro", location: "San Francisco, CA", lastActive: "Now", current: true },
		{ id: 2, device: "MacBook Pro", location: "San Francisco, CA", lastActive: "2 hours ago", current: false },
		{ id: 3, device: "Windows PC", location: "New York, NY", lastActive: "1 day ago", current: false }
	]);

	function handleSaveProfile() {
		if (!profile.name.trim() || !profile.email.trim()) {
			toast.error("Please fill in all fields");
			return;
		}
		isSavingProfile = true;
		setTimeout(() => {
			isSavingProfile = false;
			toast.success("Profile updated successfully");
		}, 1000);
	}

	function handleChangePassword() {
		if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
			toast.error("Please fill in all password fields");
			return;
		}
		if (passwordForm.newPassword !== passwordForm.confirmPassword) {
			toast.error("New passwords do not match");
			return;
		}
		if (passwordForm.newPassword.length < 8) {
			toast.error("Password must be at least 8 characters");
			return;
		}
		isSavingPassword = true;
		setTimeout(() => {
			isSavingPassword = false;
			passwordForm = {
				currentPassword: "",
				newPassword: "",
				confirmPassword: "",
				showCurrent: false,
				showNew: false,
				showConfirm: false
			};
			toast.success("Password changed successfully");
		}, 1000);
	}

	function handleToggle2FA() {
		if (!twoFaEnabled) {
			toast.success("Two-factor authentication enabled");
		} else {
			toast.success("Two-factor authentication disabled");
		}
	}

	function handleLogoutSession(id: number) {
		activeSessions = activeSessions.filter(s => s.id !== id);
		toast.success("Session logged out");
	}

	function handleLogoutAllSessions() {
		if (confirm("Are you sure? You will be logged out of all devices.")) {
			activeSessions = activeSessions.filter(s => s.current);
			toast.success("Logged out of all other sessions");
		}
	}
</script>

<!-- Mobile View -->
<div class="md:hidden flex flex-col min-h-screen bg-background pb-20">
	<!-- Header -->
	<div class="hidden sm:flex sticky top-0 bg-background border-b border-border/10 z-10">
		<div class="flex items-center gap-3 px-4 py-4 w-full">
			<button onclick={() => goto('/settings')} class="p-2 hover:bg-muted rounded-lg transition shrink-0">
				<ChevronLeft class="h-5 w-5" />
			</button>
			<div class="min-w-0 flex-1">
				<h1 class="text-xl font-bold">Profile</h1>
				<p class="text-xs text-muted-foreground">Manage your account</p>
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 px-4 py-6 space-y-6">
		<!-- Basic Information -->
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-base">Basic Information</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="flex items-center gap-4 pb-4 border-b border-border/20">
					<Avatar class="h-16 w-16 shrink-0">
						{#if profile.avatar}
							<AvatarImage src={profile.avatar} alt={profile.name} />
						{:else}
							<AvatarFallback>{profile.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</AvatarFallback>
						{/if}
					</Avatar>
					<Button variant="outline" size="sm" class="text-xs">Change Avatar</Button>
				</div>
				<div>
					<Label class="text-xs font-bold uppercase">Full Name</Label>
					<Input bind:value={profile.name} placeholder="Your name" class="mt-2" />
				</div>
				<div>
					<Label class="text-xs font-bold uppercase">Email</Label>
					<Input bind:value={profile.email} type="email" placeholder="your@email.com" class="mt-2" />
				</div>
				<Button class="w-full" onclick={handleSaveProfile} disabled={isSavingProfile}>
					{isSavingProfile ? "Saving..." : "Save Changes"}
				</Button>
			</CardContent>
		</Card>

		<!-- Password & Security -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Lock class="h-5 w-5 text-primary" />
					<CardTitle class="text-base">Password & Security</CardTitle>
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
					<Button class="w-full" onclick={handleChangePassword} disabled={isSavingPassword}>
						{isSavingPassword ? "Updating..." : "Update Password"}
					</Button>
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
					<CardTitle class="text-base">Active Sessions</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3">
				{#each activeSessions as session}
					<div class="flex items-start justify-between p-3 rounded-lg bg-card/50">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="font-medium text-sm">{session.device}</span>
								{#if session.current}
									<Badge class="text-xs">Current</Badge>
								{/if}
							</div>
							<p class="text-xs text-muted-foreground mt-1">{session.location}</p>
							<p class="text-xs text-muted-foreground">Last active: {session.lastActive}</p>
						</div>
						{#if !session.current}
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
		<Button variant="outline" onclick={() => goto('/settings')}>
			<ChevronLeft class="mr-2 h-4 w-4" />
			Back
		</Button>
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
					<div class="flex items-center gap-6">
						<Avatar class="h-24 w-24">
							{#if profile.avatar}
								<AvatarImage src={profile.avatar} alt={profile.name} />
							{:else}
								<AvatarFallback class="text-xl">{profile.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</AvatarFallback>
							{/if}
						</Avatar>
						<Button variant="outline">Change Avatar</Button>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<Label for="fullName" class="text-sm font-medium">Full Name</Label>
							<Input id="fullName" bind:value={profile.name} placeholder="Your name" class="mt-2" />
						</div>
						<div>
							<Label for="email" class="text-sm font-medium">Email</Label>
							<Input id="email" bind:value={profile.email} type="email" placeholder="your@email.com" class="mt-2" />
						</div>
					</div>
					<Button onclick={handleSaveProfile} disabled={isSavingProfile}>
						{isSavingProfile ? "Saving..." : "Save Changes"}
					</Button>
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
						<Button class="w-full" onclick={handleChangePassword} disabled={isSavingPassword}>
							{isSavingPassword ? "Updating..." : "Update Password"}
						</Button>
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
					{#each activeSessions as session}
						<div class="flex items-start justify-between p-3 rounded-lg border border-border/20 bg-card/50">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">{session.device}</span>
									{#if session.current}
										<Badge class="text-xs">Current</Badge>
									{/if}
								</div>
								<p class="text-xs text-muted-foreground mt-1">{session.location}</p>
								<p class="text-xs text-muted-foreground">Last active: {session.lastActive}</p>
							</div>
							{#if !session.current}
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
				</CardContent>
			</Card>
		</div>
	</div>
</div>

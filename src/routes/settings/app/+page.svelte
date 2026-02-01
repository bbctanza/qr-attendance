<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Label } from "$lib/components/ui/label";
	import { Input } from "$lib/components/ui/input";
	import { Switch } from "$lib/components/ui/switch";
	import { ChevronLeft, Bell, Moon, Eye, Lock, Database } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";
	import { mode } from "mode-watcher";

	// Settings state
	let settings = $state({
		notifications: true,
		emailNotifications: true,
		soundEnabled: true,
		darkMode: false,
		language: 'en',
		autoRefresh: true,
		autoRefreshInterval: '30',
		biometricAuth: false,
		sessionTimeout: '15',
		cacheData: true
	});

	let isSaving = $state(false);

	// Load settings from localStorage on mount
	onMount(() => {
		const savedTheme = localStorage.getItem('theme') || 'light';
		settings.darkMode = savedTheme === 'dark';
	});

	// Watch for dark mode changes and update theme + localStorage
	$effect(() => {
		const isDark = settings.darkMode;
		if (isDark) {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
		} else {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
		}
	});

	function handleSaveSettings() {
		isSaving = true;
		// Simulate save
		setTimeout(() => {
			isSaving = false;
			toast.success('Settings saved successfully');
		}, 1000);
	}

	function handleResetSettings() {
		if (confirm('Are you sure you want to reset all settings to default?')) {
			settings = {
				notifications: true,
				emailNotifications: true,
				soundEnabled: true,
				darkMode: false,
				language: 'en',
				autoRefresh: true,
				autoRefreshInterval: '30',
				biometricAuth: false,
				sessionTimeout: '15',
				cacheData: true
			};
			document.documentElement.classList.remove('dark');
				localStorage.setItem('theme', 'light');
			toast.success('Settings reset to defaults');
		}
	}

	function handleClearCache() {
		if (confirm('Clear all cached data? This may affect performance temporarily.')) {
			toast.success('Cache cleared');
		}
	}
</script>

<div class="flex flex-col gap-6 md:gap-8 p-4 md:px-8 md:py-6 lg:px-12 lg:py-8 max-w-6xl mx-auto">
	<!-- Header -->
	<div class="hidden sm:flex items-center gap-3 sm:gap-4">
		<button onclick={() => goto('/settings')} class="p-2 hover:bg-muted rounded-lg transition shrink-0">
			<ChevronLeft class="h-5 w-5 sm:h-6 sm:w-6" />
		</button>
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl md:text-3xl font-bold">App Settings</h1>
			<p class="hidden sm:block text-sm text-muted-foreground mt-1">Configure preferences and notifications</p>
		</div>
	</div>

	<!-- Settings Sections Grid -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 auto-rows-max">
		<!-- Notifications Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Bell class="h-5 w-5 text-primary shrink-0" />
					<CardTitle class="text-base sm:text-lg">Notifications</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Push Notifications</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Receive real-time alerts and updates</p>
					</div>
					<Switch bind:checked={settings.notifications} class="shrink-0" />
				</div>
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Email Notifications</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Send summary emails daily</p>
					</div>
					<Switch bind:checked={settings.emailNotifications} class="shrink-0" />
				</div>
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Sound Alerts</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Play sound for important notifications</p>
					</div>
					<Switch bind:checked={settings.soundEnabled} class="shrink-0" />
				</div>
			</CardContent>
		</Card>

		<!-- Display Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Eye class="h-5 w-5 text-primary shrink-0" />
					<CardTitle class="text-base sm:text-lg">Display</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Dark Mode</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Use dark theme for the app</p>
					</div>
					<Switch bind:checked={settings.darkMode} class="shrink-0" />
				</div>
				<div class="mt-4">
					<Label for="language" class="text-xs sm:text-sm font-medium">Language</Label>
					<select 
						id="language"
						bind:value={settings.language}
						class="w-full mt-2 rounded-lg border border-input px-3 py-2 text-xs sm:text-sm bg-background"
					>
						<option value="en">English</option>
						<option value="es">Español</option>
						<option value="fr">Français</option>
						<option value="de">Deutsch</option>
						<option value="zh">中文</option>
					</select>
				</div>
			</CardContent>
		</Card>

		<!-- Data Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Database class="h-5 w-5 text-primary shrink-0" />
					<CardTitle class="text-base sm:text-lg">Data & Performance</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Auto Refresh</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Automatically refresh data in background</p>
					</div>
					<Switch bind:checked={settings.autoRefresh} class="shrink-0" />
				</div>
				{#if settings.autoRefresh}
					<div>
						<Label for="refreshInterval" class="text-xs sm:text-sm font-medium">Refresh Interval (seconds)</Label>
						<Input 
							id="refreshInterval"
							type="number" 
							bind:value={settings.autoRefreshInterval}
							min="10"
							max="300"
							class="mt-2 text-xs sm:text-sm"
						/>
					</div>
				{/if}
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Cache Data</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Store data locally for faster access</p>
					</div>
					<Switch bind:checked={settings.cacheData} class="shrink-0" />
				</div>
				{#if settings.cacheData}
					<Button 
						variant="outline" 
						class="w-full mt-2 text-xs sm:text-sm"
						onclick={handleClearCache}
					>
						Clear Cache
					</Button>
				{/if}
			</CardContent>
		</Card>

		<!-- Security Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Lock class="h-5 w-5 text-primary shrink-0" />
					<CardTitle class="text-base sm:text-lg">Security</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Biometric Authentication</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Use fingerprint or face recognition</p>
					</div>
					<Switch bind:checked={settings.biometricAuth} class="shrink-0" />
				</div>
				<div>
					<Label for="sessionTimeout" class="text-xs sm:text-sm font-medium">Session Timeout (minutes)</Label>
					<Input 
						id="sessionTimeout"
						type="number" 
						bind:value={settings.sessionTimeout}
						min="5"
						max="120"
						class="mt-2 text-xs sm:text-sm"
					/>
					<p class="text-xs text-muted-foreground mt-1">Auto-logout after inactivity</p>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Action Buttons -->
	<div class="flex flex-col sm:flex-row gap-3">
		<Button 
			class="w-full sm:flex-1 text-xs sm:text-sm" 
			onclick={handleSaveSettings}
			disabled={isSaving}
		>
			{isSaving ? 'Saving...' : 'Save Settings'}
		</Button>
		<Button 
			variant="outline" 
			class="w-full sm:flex-1 text-xs sm:text-sm"
			onclick={handleResetSettings}
		>
			Reset to Defaults
		</Button>
	</div>
</div>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import {
		type DateValue,
		DateFormatter,
		getLocalTimeZone,
		parseDate,
		CalendarDate,
		today
	} from '@internationalized/date';
	import { cn, getErrorMessage, getErrorTitle } from '$lib/utils';
	import {
		ChevronLeft,
		Bell,
		Eye,
		Lock,
		Database,
		Palette,
		Type,
		Save,
		QrCode,
		Globe,
		ScanLine
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { mode } from 'mode-watcher';
	import { systemSettings, loadSettings } from '$lib/stores/settings';
	import { supabase } from '$lib/supabase';
	import ColorPicker from 'svelte-awesome-color-picker';
	import { fly } from 'svelte/transition';

	let userRole = $state<string | null>(null);

	// Check if user is a guest
	const isGuest = $derived(userRole === 'guest');

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
		cacheData: true,
		// System global settings
		siteName: $systemSettings.siteName || 'Scan-in System',
		primaryColor: $systemSettings.primaryColor || '#275032',
		timezone: $systemSettings.timezone || 'Asia/Manila',
		timeFormat: localStorage.getItem('time_format') === '12h' ? '12h' : '24h',
		qrHeaderTitle: $systemSettings.qrHeaderTitle || 'Organization Name',
		qrSubheaderTitle: $systemSettings.qrSubheaderTitle || 'Tagline or Subtitle',
		qrCardColor: $systemSettings.qrCardColor || '#275032',
		qrBackgroundImage: $systemSettings.qrBackgroundImage || '',
		scanModalEnabled: $systemSettings.scanModalEnabled ?? true,
		scanModalDuration: $systemSettings.scanModalDuration ?? 5
	});

	// Drag and drop state
	let draggedFileName = $state<string>('');
	let isDragging = $state(false);

	// Track original settings for dirty checking (initialized in onMount)
	let originalSettings = $state({} as typeof settings);

	// Check if settings have changed
	let isDirty = $derived(JSON.stringify(settings) !== JSON.stringify(originalSettings));

	$effect(() => {
		if (typeof document === 'undefined') return;
		if (isDirty) document.body.classList.add('hide-mobile-nav');
		else document.body.classList.remove('hide-mobile-nav');

		return () => {
			if (typeof document !== 'undefined') document.body.classList.remove('hide-mobile-nav');
		};
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.body.classList.remove('hide-mobile-nav');

			// Revert unsaved theme changes when leaving the page
			const savedTheme = localStorage.getItem('theme');
			const effectiveDark = savedTheme === 'dark';

			if (effectiveDark) {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		}
	});

	let isSaving = $state(false);
	let recentColors = $state<string[]>([]);
	let previewBackgroundDataUrl = $state<string>('');

	// Load settings from localStorage on mount
	onMount(async () => {
		const savedTheme = localStorage.getItem('theme');
		settings.darkMode = savedTheme === 'dark';

		// Load recent colors
		const savedColors = localStorage.getItem('recentColors');
		if (savedColors) {
			try {
				recentColors = JSON.parse(savedColors);
			} catch (e) {
				console.error('Failed to parse recent colors', e);
			}
		}

		// Load system settings
		await loadSettings();

		// Load User Role
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (user) {
			const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
			if (data) userRole = data.role;
		}

		settings.siteName = $systemSettings.siteName;
		settings.primaryColor = $systemSettings.primaryColor;
		settings.timezone = $systemSettings.timezone;
		settings.qrHeaderTitle = $systemSettings.qrHeaderTitle;
		settings.qrSubheaderTitle = $systemSettings.qrSubheaderTitle;
		settings.qrCardColor = $systemSettings.qrCardColor;
		settings.qrBackgroundImage = $systemSettings.qrBackgroundImage || '';
		settings.scanModalEnabled = $systemSettings.scanModalEnabled ?? true;
		settings.scanModalDuration = $systemSettings.scanModalDuration ?? 5;

		// Update original settings after loading
		originalSettings = JSON.parse(JSON.stringify(settings));
	});

	// Watch for time format changes and update localStorage
	// $effect(() => { ... }) - REMOVED: Only save on explicit action

	// Preview mode: Update DOM immediately but DO NOT save to localStorage
	$effect(() => {
		const isDark = settings.darkMode;
		if (typeof document !== 'undefined') {
			if (isDark) {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		}
	});

	// Convert background image URL to data URL for live preview
	$effect(() => {
		if (settings.qrBackgroundImage && settings.qrBackgroundImage.startsWith('http')) {
			(async () => {
				try {
					const fileName = settings.qrBackgroundImage.split('/').pop();
					if (fileName) {
						const { data, error } = await supabase.storage.from('qr-background').download(fileName);
						if (!error && data) {
							previewBackgroundDataUrl = await new Promise<string>((resolve, reject) => {
								const reader = new FileReader();
								reader.onload = () => resolve(reader.result as string);
								reader.onerror = reject;
								reader.readAsDataURL(data);
							});
						}
					}
				} catch (e) {
					console.warn('Could not convert background image for preview', e);
				}
			})();
		} else {
			previewBackgroundDataUrl = '';
		}
	});

	async function handleSaveSettings() {
		// Prevent guests from saving global settings
		if (isGuest) {
			toast.error('Guest users cannot modify app settings');
			return;
		}

		isSaving = true;

		try {
			// Delete old image from storage if image was removed
			if (originalSettings.qrBackgroundImage && !settings.qrBackgroundImage) {
				const oldFileName = originalSettings.qrBackgroundImage.split('/').pop();
				if (oldFileName) {
					await supabase.storage.from('qr-background').remove([oldFileName]);
				}
			}

			// Update Supabase
			const { error } = await supabase.from('system_settings').upsert({
				id: 1,
				site_name: settings.siteName,
				primary_color: settings.primaryColor,
				timezone: settings.timezone,
				qr_header_title: settings.qrHeaderTitle,
				qr_subheader_title: settings.qrSubheaderTitle,
				qr_card_color: settings.qrCardColor,
				qr_background_image: settings.qrBackgroundImage,
				scan_modal_enabled: settings.scanModalEnabled,
				scan_modal_duration: settings.scanModalDuration
			});

			if (error) throw error;

			// Apply Local Storage Settings (Theme & Time)
			localStorage.setItem('time_format', settings.timeFormat);

			if (settings.darkMode) {
				document.documentElement.classList.add('dark');
				localStorage.setItem('theme', 'dark');
			} else {
				document.documentElement.classList.remove('dark');
				localStorage.setItem('theme', 'light');
			}

			// Add to recent colors if new
			if (!recentColors.includes(settings.primaryColor)) {
				recentColors = [settings.primaryColor, ...recentColors].slice(0, 5); // Keep last 5
				localStorage.setItem('recentColors', JSON.stringify(recentColors));
			}

			// Reload to apply changes everywhere
			await loadSettings();

			// Update original settings to match current state (clears dirty flag)
			originalSettings = JSON.parse(JSON.stringify(settings));

			// Simulate other saves
			setTimeout(() => {
				isSaving = false;
				toast.success('Settings saved successfully');
			}, 800);
		} catch (err) {
			console.error(err);
			isSaving = false;
			toast.error('Failed to save settings');
		}
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
				cacheData: true,
				siteName: $systemSettings.siteName,
				primaryColor: $systemSettings.primaryColor,
				timezone: $systemSettings.timezone,
				timeFormat: '24h',
				qrHeaderTitle: $systemSettings.qrHeaderTitle,
				qrSubheaderTitle: $systemSettings.qrSubheaderTitle,
				qrCardColor: $systemSettings.qrCardColor,
				qrBackgroundImage: $systemSettings.qrBackgroundImage || '',
				scanModalEnabled: true,
				scanModalDuration: 5
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

	async function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		// Check file size (max 5MB)
		if (file.size > 5 * 1024 * 1024) {
			toast.error('Image size must be less than 5MB');
			return;
		}

		// Check file type
		if (!file.type.startsWith('image/')) {
			toast.error('Please upload an image file');
			return;
		}

		try {
			toast.info('Image selected. Click Save to apply changes.');

			// Generate unique filename
			const timestamp = Date.now();
			const extension = file.name.split('.').pop();
			const fileName = `qr-background-${timestamp}.${extension}`;

			// Upload to Supabase Storage
			const { data, error } = await supabase.storage.from('qr-background').upload(fileName, file, {
				cacheControl: '3600',
				upsert: false
			});

			if (error) throw error;

			// Get public URL
			const { data: urlData } = supabase.storage.from('qr-background').getPublicUrl(fileName);

			// Only update local state - don't save to database yet
			settings.qrBackgroundImage = urlData.publicUrl;

			// Convert to data URL for preview
			try {
				previewBackgroundDataUrl = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = (e) => resolve(e.target?.result as string);
					reader.onerror = reject;
					reader.readAsDataURL(file);
				});
			} catch (err) {
				previewBackgroundDataUrl = '';
			}

			// Reset input
			input.value = '';
		} catch (error) {
			console.error('Upload error:', error);
			const msg = getErrorMessage(error);
			const title = getErrorTitle(error);
			toast.error(`${title}: ${msg}`);
		}
	}

	async function handleRemoveImage() {
		if (!confirm('Remove background image?')) return;

		// Only update local state - don't delete from database yet
		settings.qrBackgroundImage = '';
		previewBackgroundDataUrl = '';
		draggedFileName = '';

		toast.info('Background image removed. Click Save to apply changes.');
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragging = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			const file = files[0];
			draggedFileName = file.name;

			// Set file to input and trigger upload
			const input = document.getElementById('qrBackground') as HTMLInputElement;
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			input.files = dataTransfer.files;

			// Trigger change event
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}

	// Dev Tools - Moved to /settings/dev

	async function runDevTool(tool: 'fix_past' | 'process_all' | 'clear_history') {
		if (!confirm('Are you sure? This is a developer action.')) return;

		const toastId = toast.loading('Running tool...');
		try {
			if (tool === 'fix_past') {
				// Calls auto-update status which completes past events
				const { error } = await supabase.rpc('update_event_statuses');
				if (error) throw error;
				toast.success('Past events fixed & completed', { id: toastId });
			} else if (tool === 'process_all') {
				// Force process all completed events (ensure attendance is generated)
				const { error } = await supabase.rpc('force_process_all_events');
				if (error) throw error;
				toast.success('All events processed', { id: toastId });
			} else if (tool === 'clear_history') {
				const { error } = await supabase.rpc('clear_attendance_history');
				if (error) throw error;
				toast.success('Attendance history wiped', { id: toastId });
			}
		} catch (e: any) {
			console.error(e);
			const msg = getErrorMessage(e);
			const title = getErrorTitle(e);
			toast.error(`${title}: ${msg}`, { id: toastId });
		}
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:gap-8 md:p-6 lg:p-8">
	<!-- Header -->
	<div class="hidden items-center gap-3 sm:flex sm:gap-4">
		<button
			onclick={() => goto('/settings')}
			class="shrink-0 rounded-lg p-2 transition hover:bg-muted"
		>
			<ChevronLeft class="h-5 w-5 sm:h-6 sm:w-6" />
		</button>
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold md:text-3xl">App Settings</h1>
			<p class="mt-1 hidden text-sm text-muted-foreground sm:block">
				Configure preferences and notifications
			</p>
		</div>
	</div>

	<!-- Guest Restriction Banner -->
	{#if isGuest}
		<div class="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
			<div class="mt-0.5 text-red-600 dark:text-red-400">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line
						x1="12"
						y1="16"
						x2="12.01"
						y2="16"
					/></svg
				>
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-red-700 dark:text-red-300">Guest Access</p>
				<p class="mt-1 text-xs text-red-600 dark:text-red-400">
					You have view-only access. Global app settings are restricted and cannot be modified.
				</p>
			</div>
		</div>
	{/if}

	<!-- Settings Sections Grid -->
	<div class="grid auto-rows-max grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Branding Section -->
		<div class:opacity-50={isGuest} class:pointer-events-none={isGuest}>
			<Card class="border-primary/20 bg-primary/5 lg:col-span-1">
				<CardHeader class="pb-3">
					<div class="flex items-center gap-2">
						<Palette class="h-5 w-5 shrink-0 text-primary" />
						<CardTitle class="text-base sm:text-lg">Branding & Appearance</CardTitle>
						{#if isGuest}
							<span
								class="ml-auto rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400"
								>Restricted</span
							>
						{/if}
					</div>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="siteName" class="text-sm font-medium sm:text-base">System Name</Label>
						<Input
							id="siteName"
							bind:value={settings.siteName}
							placeholder="Scan-in System"
							disabled={isGuest}
						/>
						<p class="text-xs text-muted-foreground sm:text-sm">
							The name displayed in the browser tab and sidebar.
						</p>
					</div>

					<div class="space-y-2">
						<Label for="primaryColor" class="text-sm font-medium sm:text-base">Primary Color</Label>
						<div
							class="flex items-center gap-3"
							class:opacity-50={isGuest}
							class:pointer-events-none={isGuest}
						>
							<ColorPicker bind:hex={settings.primaryColor} label="Pick a color" />
						</div>
						<p class="text-xs text-muted-foreground sm:text-sm">
							The main color used for buttons, links, and branding.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Localization Section -->
		<div class:opacity-50={isGuest} class:pointer-events-none={isGuest}>
			<Card class="lg:col-span-1">
				<CardHeader class="pb-3">
					<div class="flex items-center gap-2">
						<Globe class="h-5 w-5 shrink-0 text-primary" />
						<CardTitle class="text-base sm:text-lg">Localization</CardTitle>
						{#if isGuest}
							<span
								class="ml-auto rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400"
								>Restricted</span
							>
						{/if}
					</div>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label class="text-sm font-medium sm:text-base">System Timezone</Label>
						<Select.Root type="single" bind:value={settings.timezone} disabled={isGuest}>
							<Select.Trigger class="w-full" disabled={isGuest}>
								{settings.timezone || 'Select Timezone'}
							</Select.Trigger>
							<Select.Content class="max-h-75 overflow-y-auto">
								<Select.Group>
									<Select.Label>Common</Select.Label>
									<Select.Item value="UTC">UTC (Universal Time)</Select.Item>
									<Select.Item value="Asia/Manila">Asia/Manila (GMT+8)</Select.Item>
									<Select.Item value="America/New_York">America/New_York (EST)</Select.Item>
									<Select.Item value="America/Los_Angeles">America/Los_Angeles (PST)</Select.Item>
									<Select.Item value="Europe/London">Europe/London (GMT)</Select.Item>
									<Select.Item value="Asia/Tokyo">Asia/Tokyo (JST)</Select.Item>
									<Select.Item value="Australia/Sydney">Australia/Sydney (AEST)</Select.Item>
								</Select.Group>
							</Select.Content>
						</Select.Root>
						<p class="text-xs text-muted-foreground sm:text-sm">
							This timezone will be applied to all event schedules and attendance records.
						</p>
					</div>

					<div class="space-y-2">
						<Label class="text-sm font-medium sm:text-base">Time Format</Label>
						<Select.Root type="single" bind:value={settings.timeFormat} disabled={isGuest}>
							<Select.Trigger class="w-full" disabled={isGuest}>
								{settings.timeFormat === '12h'
									? '12-Hour Format (2:30 PM)'
									: '24-Hour Format (14:30)'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="12h">12-Hour Format (2:30 PM)</Select.Item>
								<Select.Item value="24h">24-Hour Format (14:30)</Select.Item>
							</Select.Content>
						</Select.Root>
						<p class="text-xs text-muted-foreground sm:text-sm">
							Choose how times are displayed throughout the application.
						</p>
					</div>

					<div
						class="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-600 dark:text-yellow-400"
					>
						<span class="font-bold">Note:</span> Changing timezone affects how event times are displayed
						globally.
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Developer Section (Removed - Now at /settings/dev) -->

		<!-- Notifications Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Bell class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Notifications</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start justify-between gap-3 sm:items-center">
					<div class="min-w-0 flex-1">
						<Label class="text-sm font-medium sm:text-base">Push Notifications</Label>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">Receive real-time updates</p>
					</div>
					<Switch bind:checked={settings.notifications} class="shrink-0" />
				</div>
				<div class="flex items-start justify-between gap-3 sm:items-center">
					<div class="min-w-0 flex-1">
						<Label class="text-sm font-medium sm:text-base">Email Notifications</Label>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">Get updates via email</p>
					</div>
					<Switch bind:checked={settings.emailNotifications} class="shrink-0" />
				</div>
			</CardContent>
		</Card>

		<!-- Display Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Eye class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Display</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start justify-between gap-3 sm:items-center">
					<div class="min-w-0 flex-1">
						<Label class="text-sm font-medium sm:text-base">Dark Mode</Label>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">Use dark theme for the app</p>
					</div>
					<Switch bind:checked={settings.darkMode} class="shrink-0" />
				</div>
				<div class="mt-4">
					<Label for="language" class="text-xs font-medium sm:text-sm">Language</Label>
					<select
						id="language"
						bind:value={settings.language}
						class="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs sm:text-sm"
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

		<!-- Scan Settings Section -->
		<div class:opacity-50={isGuest} class:pointer-events-none={isGuest}>
			<Card class="lg:col-span-1">
				<CardHeader class="pb-3">
					<div class="flex items-center gap-2">
						<ScanLine class="h-5 w-5 shrink-0 text-primary" />
						<CardTitle class="text-base sm:text-lg">Scan Settings</CardTitle>
						{#if isGuest}
							<span class="ml-auto rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400">Restricted</span>
						{/if}
					</div>
				</CardHeader>
				<CardContent class="space-y-3 sm:space-y-4">
					<div class="flex items-start justify-between gap-3 sm:items-center">
						<div class="min-w-0 flex-1">
							<Label class="text-sm font-medium sm:text-base">Show Scan Modal</Label>
							<p class="mt-1 text-xs text-muted-foreground sm:text-sm">Display full-screen popup on scan</p>
						</div>
						<Switch bind:checked={settings.scanModalEnabled} class="shrink-0" />
					</div>
					{#if settings.scanModalEnabled}
						<div>
							<Label for="scanModalDuration" class="text-xs font-medium sm:text-sm">Modal Duration (seconds)</Label>
							<Input
								id="scanModalDuration"
								type="number"
								bind:value={settings.scanModalDuration}
								min="1"
								max="15"
								class="mt-2 text-xs sm:text-sm"
							/>
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Data Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Database class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Data & Performance</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start justify-between gap-3 sm:items-center">
					<div class="min-w-0 flex-1">
						<Label class="text-sm font-medium sm:text-base">Auto Refresh</Label>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
							Automatically refresh data in background
						</p>
					</div>
					<Switch bind:checked={settings.autoRefresh} class="shrink-0" />
				</div>
				{#if settings.autoRefresh}
					<div>
						<Label for="refreshInterval" class="text-xs font-medium sm:text-sm"
							>Refresh Interval (seconds)</Label
						>
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
				<div class="flex items-start justify-between gap-3 sm:items-center">
					<div class="min-w-0 flex-1">
						<Label class="text-sm font-medium sm:text-base">Cache Data</Label>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
							Store data locally for faster access
						</p>
					</div>
					<Switch bind:checked={settings.cacheData} class="shrink-0" />
				</div>
				{#if settings.cacheData}
					<Button
						variant="outline"
						class="mt-2 w-full text-xs sm:text-sm"
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
					<Lock class="h-5 w-5 shrink-0 text-primary" />
					<CardTitle class="text-base sm:text-lg">Security</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-3 sm:space-y-4">
				<div class="flex items-start justify-between gap-3 sm:items-center">
					<div class="min-w-0 flex-1">
						<Label class="text-sm font-medium sm:text-base">Biometric Authentication</Label>
						<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
							Use fingerprint or face recognition
						</p>
					</div>
					<Switch bind:checked={settings.biometricAuth} class="shrink-0" />
				</div>
				<div>
					<Label for="sessionTimeout" class="text-xs font-medium sm:text-sm"
						>Session Timeout (minutes)</Label
					>
					<Input
						id="sessionTimeout"
						type="number"
						bind:value={settings.sessionTimeout}
						min="5"
						max="120"
						class="mt-2 text-xs sm:text-sm"
					/>
					<p class="mt-1 text-xs text-muted-foreground">Auto-logout after inactivity</p>
				</div>
			</CardContent>
		</Card>

		<!-- QR Code Details Section -->
		<div class:opacity-50={isGuest} class:pointer-events-none={isGuest} class="lg:col-span-2">
			<Card class="lg:col-span-2">
				<CardHeader class="mb-6 border-b border-border/10 pb-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<QrCode class="h-5 w-5 shrink-0 text-primary" />
							<CardTitle class="text-base sm:text-lg">QR Card Generation</CardTitle>
							{#if isGuest}
								<span
									class="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400"
									>Restricted</span
								>
							{/if}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
						<!-- Config Side -->
						<div class="space-y-6">
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<Label for="qrHeader" class="text-sm font-medium sm:text-base">Header Title</Label
									>
									{#if settings.qrHeaderTitle !== originalSettings.qrHeaderTitle}
										<span
											class="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
											>Unsaved</span
										>
									{/if}
								</div>
								<Input
									id="qrHeader"
									bind:value={settings.qrHeaderTitle}
									placeholder="e.g., Your Organization Name"
									disabled={isGuest}
								/>
								<p class="text-xs text-muted-foreground">
									Main title displayed at the top of the QR card.
								</p>
							</div>

							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<Label for="qrSubheader" class="text-sm font-medium sm:text-base"
										>Subheader Text</Label
									>
									{#if settings.qrSubheaderTitle !== originalSettings.qrSubheaderTitle}
										<span
											class="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
											>Unsaved</span
										>
									{/if}
								</div>
								<Input
									id="qrSubheader"
									bind:value={settings.qrSubheaderTitle}
									placeholder="e.g., Your tagline or mission"
									disabled={isGuest}
								/>
								<p class="text-xs text-muted-foreground">
									Subtitle or tagline displayed below the main header.
								</p>
							</div>

							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<Label for="qrCardColor" class="text-sm font-medium sm:text-base"
										>Branding Color</Label
									>
									{#if settings.qrCardColor !== originalSettings.qrCardColor}
										<span
											class="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
											>Unsaved</span
										>
									{/if}
								</div>
								<div
									class="flex items-center gap-3"
									class:opacity-50={isGuest}
									class:pointer-events-none={isGuest}
								>
									<ColorPicker bind:hex={settings.qrCardColor} label="Pick a color" />
								</div>
								<p class="text-xs text-muted-foreground">
									The color used for text and branding on the generated QR cards.
								</p>
							</div>

							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<Label for="qrBackground" class="text-sm font-medium sm:text-base"
										>Background Image</Label
									>
									<span class="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
										>Optional</span
									>
								</div>
								<div class="space-y-3">
									{#if settings.qrBackgroundImage}
										<div
											class="group relative w-full overflow-hidden rounded-xl border-2 border-border/30 bg-linear-to-br from-muted to-muted/50 shadow-md transition-all duration-300 hover:shadow-lg"
										>
											<!-- Image Container -->
											<div class="relative h-48 w-full overflow-hidden bg-muted">
												<img
													src={settings.qrBackgroundImage}
													alt="Background preview"
													class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
												/>
												<!-- Overlay Gradient -->
												<div
													class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/20 to-transparent"
												></div>
											</div>

											<!-- Remove Button -->
											<button
												onclick={handleRemoveImage}
												class="absolute top-3 right-3 z-10 transform rounded-lg bg-red-500/90 p-2 text-white shadow-md transition-all duration-200 hover:scale-110 hover:bg-red-600"
												aria-label="Remove background image"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="18"
													height="18"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
													stroke-linecap="round"
													stroke-linejoin="round"
													><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
												>
											</button>

											<!-- Info Footer -->
											<div class="border-t border-border/20 bg-muted/50 px-4 py-3">
												<div class="flex items-center justify-between">
													<div class="flex items-center gap-2 text-sm">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="16"
															height="16"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															stroke-linecap="round"
															stroke-linejoin="round"
															class="text-primary"
															><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
																cx="9"
																cy="9"
																r="2"
															/><path d="m21 15-5-5L7 21" /></svg
														>
														<span class="font-medium text-foreground">Image uploaded</span>
													</div>
													<button
														onclick={() =>
															(
																document.getElementById('qrBackground') as HTMLInputElement
															)?.click()}
														class="text-xs font-medium text-primary transition-colors hover:text-primary/80"
													>
														Change
													</button>
												</div>
											</div>
										</div>
									{:else}
										<label
											for="qrBackground"
											class="group block cursor-pointer"
											ondragover={handleDragOver}
											ondragleave={handleDragLeave}
											ondrop={handleDrop}
										>
											<div
												class={cn(
													'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 py-8 transition-all duration-300',
													(isDragging ?? false)
														? 'scale-105 border-primary bg-primary/10'
														: 'border-border/40 group-hover:border-primary/50 group-hover:bg-primary/5'
												)}
											>
												<div class="flex flex-col items-center justify-center gap-2">
													<div
														class={cn(
															'rounded-lg p-3 transition-all',
															(isDragging ?? false)
																? 'scale-110 bg-primary/30'
																: 'bg-primary/10 group-hover:bg-primary/20'
														)}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="32"
															height="32"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															stroke-linecap="round"
															stroke-linejoin="round"
															class={cn(
																'transition-colors',
																isDragging ? 'text-primary' : 'text-primary'
															)}
															><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
																cx="9"
																cy="9"
																r="2"
															/><path d="m21 15-5-5L7 21" /></svg
														>
													</div>
													{#if draggedFileName}
														<div class="flex items-center gap-2">
															<p class="text-sm font-semibold text-primary">{draggedFileName}</p>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="16"
																height="16"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2"
																stroke-linecap="round"
																stroke-linejoin="round"
																class="animate-pulse text-primary"
																><polyline points="20 6 9 17 4 12" /></svg
															>
														</div>
														<p class="text-xs text-muted-foreground">Ready to upload</p>
													{:else}
														<p class="text-sm font-semibold text-foreground">
															Upload Background Image
														</p>
														<p class="text-xs text-muted-foreground">or drag and drop</p>
													{/if}
												</div>
												<div class="mt-4 flex gap-2 text-xs text-muted-foreground">
													<span class="rounded-md bg-muted px-2 py-1 font-medium">PNG</span>
													<span class="rounded-md bg-muted px-2 py-1 font-medium">JPG</span>
													<span class="rounded-md bg-muted px-2 py-1 font-medium">Max 5MB</span>
												</div>
											</div>
										</label>
									{/if}
									<input
										id="qrBackground"
										type="file"
										accept="image/*"
										class="hidden"
										onchange={handleImageUpload}
									/>
								</div>
								<p class="flex items-center gap-2 text-xs text-muted-foreground">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="opacity-60"
										><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg
									>
									Used as background on generated QR cards. Visible in all exports.
								</p>
							</div>
						</div>

						<!-- Preview Side -->
						<div
							class="flex min-h-100 flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/40 p-6"
						>
							<div class="mb-6 text-xs font-bold tracking-wider text-muted-foreground uppercase">
								Live Preview
							</div>

							<!-- Mini QR Card Mock -->
							<div
								class="relative flex h-75 w-75 flex-col items-center overflow-hidden rounded-xl border border-border/20 bg-white p-4 shadow-xl"
							>
								<!-- Background Image Overlay -->
								{#if previewBackgroundDataUrl}
									<div class="absolute inset-0 z-0">
										<img
											src={previewBackgroundDataUrl}
											alt="Background"
											class="h-full w-full object-cover"
										/>
									</div>
								{/if}
								<!-- Header Text -->
								<div class="relative z-10 mt-2 px-2 text-center">
									<h4
										class="text-[14px] leading-tight font-bold"
										style="color: {settings.qrCardColor}"
									>
										{settings.qrHeaderTitle || 'HEADER TITLE'}
									</h4>
									<p
										class="mt-1 text-[10px] font-medium italic opacity-100"
										style="color: {settings.qrCardColor}"
									>
										{settings.qrSubheaderTitle || 'Subheader goes here'}
									</p>
								</div>

								<!-- Mock QR Code Box -->
								<div
									class="relative z-10 mt-4 flex h-36 w-36 items-center justify-center rounded-lg border-4 bg-white"
									style="border-color: {settings.qrCardColor}20"
								>
									<QrCode class="h-24 w-24 opacity-100" style="color: {settings.qrCardColor}" />
								</div>

								<!-- Member Name (Below QR) -->
								<div class="relative z-10 mt-4 text-center">
									<div
										class="text-[12px] font-bold uppercase"
										style="color: {settings.qrCardColor}"
									>
										Sample Member
									</div>
								</div>

								<!-- Member ID (Bottom) -->
								<div class="relative z-10 mt-2 mb-4 text-center">
									<div
										class="text-[12px] font-black tracking-widest"
										style="color: {settings.qrCardColor}"
									>
										ENG-1234
									</div>
								</div>

								<!-- BG Pattern Mock (Subtle) -->
								<div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-100">
									<div
										class="absolute top-0 right-0 h-32 w-32 rounded-full blur-3xl"
										style="background-color: {settings.qrCardColor}"
									></div>
									<div
										class="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl"
										style="background-color: {settings.qrCardColor}"
									></div>
								</div>
							</div>
							<p class="mt-4 text-center text-[11px] text-muted-foreground">
								Generating a real image uses 1080x1080 resolution.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="flex flex-col gap-3 sm:flex-row">
		<Button
			variant="outline"
			class="w-full text-xs sm:flex-1 sm:text-sm"
			onclick={handleResetSettings}
		>
			Reset to Defaults
		</Button>
	</div>
</div>

<!-- Floating Save Button (Desktop) -->
{#if isDirty}
	<div
		transition:fly={{ y: 20, duration: 300 }}
		class="fixed right-6 bottom-6 z-50 hidden items-center gap-3 rounded-full border border-border/50 bg-card p-2 pl-4 shadow-lg shadow-black/5 md:flex"
	>
		<span class="text-sm font-medium text-muted-foreground">Unsaved changes</span>
		<Button
			size="sm"
			onclick={handleSaveSettings}
			disabled={isSaving}
			class="rounded-full px-6 shadow-md"
		>
			{#if isSaving}
				Saving...
			{:else}
				<Save class="mr-2 h-4 w-4" />
				Save Changes
			{/if}
		</Button>
	</div>

	<!-- Fixed Save Button (Mobile) -->
	<div
		transition:fly={{ y: 100, duration: 300 }}
		class="fixed right-4 bottom-4 left-4 z-50 md:hidden"
	>
		<Button
			class="h-14 w-full rounded-xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20"
			onclick={handleSaveSettings}
			disabled={isSaving}
		>
			{#if isSaving}
				Saving...
			{:else}
				Save Changes
			{/if}
		</Button>
	</div>
{/if}

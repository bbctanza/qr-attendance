<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Label } from "$lib/components/ui/label";
	import { Input } from "$lib/components/ui/input";
	import { Switch } from "$lib/components/ui/switch";
    import * as Select from "$lib/components/ui/select";
    import { Calendar } from "$lib/components/ui/calendar";
    import * as Popover from "$lib/components/ui/popover";
    import { type DateValue, DateFormatter, getLocalTimeZone, parseDate, CalendarDate, today } from "@internationalized/date";
    import { cn } from "$lib/utils";
	import { ChevronLeft, Bell, Moon, Eye, Lock, Database, Palette, Type, Save, QrCode, Globe, Wrench, CalendarClock, Trash2, RefreshCw, Construction, Calendar as CalendarIcon, Clock } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";
	import { mode } from "mode-watcher";
	import { systemSettings, loadSettings } from "$lib/stores/settings";
    import { devTools } from "$lib/stores/dev";
	import { supabase } from "$lib/supabase";
	import ColorPicker from 'svelte-awesome-color-picker';
    import { fly } from 'svelte/transition';

    let userRole = $state<string | null>(null);
    let mockDateStr = $state("");
    let mockTimeStr = $state("");
    
    // Date Picker State
    let mockDateValue = $state<DateValue | undefined>();
    const df = new DateFormatter("en-US", {
        dateStyle: "medium"
    });

    // Sync from store
    $effect(() => {
        if ($devTools.isMockTimeActive && $devTools.mockTime) {
            const d = $devTools.mockTime;
            // Format YYYY-MM-DD and HH:MM
            const isoDate = d.toISOString().split('T')[0];
            mockDateStr = isoDate;
            mockTimeStr = d.toTimeString().slice(0, 5);
             try {
                mockDateValue = parseDate(isoDate);
            } catch (e) { }
        }
    });

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
		qrBackgroundImage: $systemSettings.qrBackgroundImage || ''
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
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const effectiveDark = savedTheme === 'dark' || (!savedTheme && systemDark);

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
		const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		settings.darkMode = savedTheme === 'dark' || (!savedTheme && systemDark);
		
		// Load recent colors
		const savedColors = localStorage.getItem('recentColors');
		if (savedColors) {
			try {
				recentColors = JSON.parse(savedColors);
			} catch (e) {
				console.error("Failed to parse recent colors", e);
			}
		}

		// Load system settings
		await loadSettings();
        
        // Load User Role
        const { data: { user } } = await supabase.auth.getUser();
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
						const { data, error } = await supabase.storage
							.from('qr-background')
							.download(fileName);
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
			const { error } = await supabase
				.from('system_settings')
				.upsert({ 
					id: 1, 
					site_name: settings.siteName, 
					primary_color: settings.primaryColor,
                    timezone: settings.timezone,
					qr_header_title: settings.qrHeaderTitle,
					qr_subheader_title: settings.qrSubheaderTitle,
					qr_card_color: settings.qrCardColor,
					qr_background_image: settings.qrBackgroundImage
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
				toast.success("Settings saved successfully");
			}, 800);
		} catch (err) {
			console.error(err);
			isSaving = false;
			toast.error("Failed to save settings");
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
				qrBackgroundImage: $systemSettings.qrBackgroundImage || ''
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
			const { data, error } = await supabase.storage
				.from('qr-background')
				.upload(fileName, file, {
					cacheControl: '3600',
					upsert: false
				});
			
			if (error) throw error;
			
			// Get public URL
			const { data: urlData } = supabase.storage
				.from('qr-background')
				.getPublicUrl(fileName);
			
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
			toast.error('Failed to upload image');
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

    // Dev Tools Handlers
    function applyMockTime() {
        // use bound values if direct inputs, or sync from Date Picker
        if (mockDateValue) {
            mockDateStr = mockDateValue.toString();
        }

        if (!mockDateStr && !mockTimeStr) {
            devTools.clearMockTime();
            toast.success("Mock time cleared. Using real time.");
            return;
        }
        
        // combine
        const datePart = mockDateStr || new Date().toISOString().split('T')[0];
        const timePart = mockTimeStr || "00:00";
        const combined = new Date(`${datePart}T${timePart}`);
        
        if (isNaN(combined.getTime())) {
            toast.error("Invalid date/time format");
            return;
        }
        
        devTools.setMockTime(combined);
        toast.success(`Mock time set to ${combined.toLocaleString()}`);
    }

    async function runDevTool(tool: 'fix_past' | 'process_all' | 'clear_history') {
        if (!confirm("Are you sure? This is a developer action.")) return;
        
        const toastId = toast.loading("Running tool...");
        try {
            if (tool === 'fix_past') {
                // Calls auto-update status which completes past events
                const { error } = await supabase.rpc('update_event_statuses');
                if (error) throw error;
                toast.success("Past events fixed & completed", { id: toastId });
            } 
            else if (tool === 'process_all') {
                // Force process all completed events (ensure attendance is generated)
                const { error } = await supabase.rpc('force_process_all_events');
                if (error) throw error;
                toast.success("All events processed", { id: toastId });
            }
            else if (tool === 'clear_history') {
                const { error } = await supabase.rpc('clear_attendance_history');
                if (error) throw error;
                toast.success("Attendance history wiped", { id: toastId });
            }
        } catch(e: any) {
            console.error(e);
            toast.error("Tool failed: " + e.message, { id: toastId });
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
		<!-- Branding Section -->
		<Card class="lg:col-span-1 border-primary/20 bg-primary/5">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Palette class="h-5 w-5 text-primary shrink-0" />
					<CardTitle class="text-base sm:text-lg">Branding & Appearance</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="siteName" class="text-sm sm:text-base font-medium">System Name</Label>
					<Input id="siteName" bind:value={settings.siteName} placeholder="Scan-in System" />
					<p class="text-xs sm:text-sm text-muted-foreground">The name displayed in the browser tab and sidebar.</p>
				</div>

				<div class="space-y-2">
					<Label for="primaryColor" class="text-sm sm:text-base font-medium">Primary Color</Label>
					<div class="flex gap-3 items-center">
						<ColorPicker
							bind:hex={settings.primaryColor}
							label="Pick a color"
						/>
					</div>
					<p class="text-xs sm:text-sm text-muted-foreground">The main color used for buttons, links, and branding.</p>
				</div>
			</CardContent>
		</Card>

		<!-- Localization Section -->
		<Card class="lg:col-span-1">
			<CardHeader class="pb-3">
				<div class="flex items-center gap-2">
					<Globe class="h-5 w-5 text-primary shrink-0" />
					<CardTitle class="text-base sm:text-lg">Localization</CardTitle>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label class="text-sm sm:text-base font-medium">System Timezone</Label>
                    <Select.Root type="single" bind:value={settings.timezone}>
                        <Select.Trigger class="w-full">
                            {settings.timezone || "Select Timezone"}
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
					<p class="text-xs sm:text-sm text-muted-foreground">This timezone will be applied to all event schedules and attendance records.</p>
				</div>

				<div class="space-y-2">
					<Label class="text-sm sm:text-base font-medium">Time Format</Label>
					<Select.Root type="single" bind:value={settings.timeFormat}>
						<Select.Trigger class="w-full">
							{settings.timeFormat === '12h' ? '12-Hour Format (2:30 PM)' : '24-Hour Format (14:30)'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="12h">12-Hour Format (2:30 PM)</Select.Item>
							<Select.Item value="24h">24-Hour Format (14:30)</Select.Item>
						</Select.Content>
					</Select.Root>
					<p class="text-xs sm:text-sm text-muted-foreground">Choose how times are displayed throughout the application.</p>
				</div>
                
                <div class="rounded-lg bg-yellow-500/10 p-3 border border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
                    <span class="font-bold">Note:</span> Changing timezone affects how event times are displayed globally.
                </div>
			</CardContent>
		</Card>

        <!-- Developer Section (Hidden for normal users) -->
        {#if userRole === 'developer'}
        <Card class="lg:col-span-2 border-orange-500/30 bg-orange-500/5">
            <CardHeader class="pb-3 border-b border-orange-500/10 mb-4">
                <div class="flex items-center gap-2">
                    <Construction class="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0" />
                    <CardTitle class="text-base sm:text-lg text-orange-700 dark:text-orange-300">Developer Tools</CardTitle>
                </div>
            </CardHeader>
            <CardContent class="space-y-6">
                
                <!-- Mock Time -->
                <div class="space-y-3">
                    <div class="flex items-center gap-2 text-sm font-bold text-foreground/80">
                        <CalendarClock class="w-4 h-4" /> Mock Date & Time
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div class="space-y-1 flex flex-col">
                            <Label class="text-xs text-muted-foreground mb-1">Mock Date</Label>
                            <Popover.Root>
                                <Popover.Trigger>
                                    {#snippet child({ props })}
                                        <Button
                                            variant="outline"
                                            class={cn(
                                                "w-full justify-start text-left font-normal",
                                                !mockDateValue && "text-muted-foreground"
                                            )}
                                            {...props}
                                        >
                                            <CalendarIcon class="mr-2 h-4 w-4" />
                                            {mockDateValue ? df.format(mockDateValue.toDate(getLocalTimeZone())) : "Pick a date"}
                                        </Button>
                                    {/snippet}
                                </Popover.Trigger>
                                <Popover.Content class="w-auto p-0" align="start">
                                    <Calendar type="single" bind:value={mockDateValue} initialFocus />
                                </Popover.Content>
                            </Popover.Root>
                        </div>
                        <div class="space-y-1">
                            <Label class="text-xs text-muted-foreground">Mock Time</Label>
                            <div class="relative">
                                <Input type="time" bind:value={mockTimeStr} class="bg-card pl-10" />
                                <Clock class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>
                        <div class="flex items-end gap-2">
                            <Button size="sm" class="flex-1 bg-green-600 hover:bg-green-700 text-white" onclick={applyMockTime}>Apply</Button>
                            <Button size="sm" variant="outline" onclick={() => { mockDateStr=""; mockDateValue=undefined; mockTimeStr=""; applyMockTime(); }}>Reset</Button>
                        </div>
                    </div>
                    <p class="text-[11px] text-muted-foreground">If set, the app will simulate this time for client-side logic (e.g. scanner validation). Does not affect server time.</p>
                </div>

                <div class="h-px bg-orange-500/10 w-full"></div>

                <!-- DB Tools -->
                 <div class="space-y-3">
                    <div class="flex items-center gap-2 text-sm font-bold text-foreground/80">
                        <Wrench class="w-4 h-4" /> Database Testing Tools
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Button 
                            variant="default" 
                            class="bg-orange-600 hover:bg-orange-700 text-white border-none h-auto py-3 flex flex-col gap-1 items-start"
                            onclick={() => runDevTool('fix_past')}
                        >
                            <div class="flex items-center gap-2 font-bold"><Wrench class="w-4 h-4" /> Fix Past Events</div>
                            <span class="text-[10px] opacity-80 font-normal text-left">Update past events to "completed" and process attendance.</span>
                        </Button>

                        <Button 
                            variant="default" 
                            class="bg-blue-600 hover:bg-blue-700 text-white border-none h-auto py-3 flex flex-col gap-1 items-start"
                            onclick={() => runDevTool('process_all')}
                        >
                            <div class="flex items-center gap-2 font-bold"><RefreshCw class="w-4 h-4" /> Process All Events</div>
                             <span class="text-[10px] opacity-80 font-normal text-left">Force re-process attendance for all completed events.</span>
                        </Button>

                        <Button 
                            variant="default" 
                            class="bg-red-600 hover:bg-red-700 text-white border-none h-auto py-3 flex flex-col gap-1 items-start"
                            onclick={() => runDevTool('clear_history')}
                        >
                            <div class="flex items-center gap-2 font-bold"><Trash2 class="w-4 h-4" /> Clear History</div>
                             <span class="text-[10px] opacity-80 font-normal text-left">Permanently delete all attendance history.</span>
                        </Button>
                    </div>
                 </div>

            </CardContent>
        </Card>
        {/if}

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
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Receive real-time updates</p>
					</div>
					<Switch bind:checked={settings.notifications} class="shrink-0" />
				</div>
				<div class="flex items-start sm:items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<Label class="text-sm sm:text-base font-medium">Email Notifications</Label>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">Get updates via email</p>
					</div>
					<Switch bind:checked={settings.emailNotifications} class="shrink-0" />
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

		<!-- QR Code Details Section -->
		<Card class="lg:col-span-2">
			<CardHeader class="pb-3 border-b border-border/10 mb-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <QrCode class="h-5 w-5 text-primary shrink-0" />
                        <CardTitle class="text-base sm:text-lg">QR Card Generation</CardTitle>
                    </div>
                </div>
			</CardHeader>
			<CardContent>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Config Side -->
                    <div class="space-y-6">
                        <div class="space-y-2">
                            <div class="flex items-center gap-2">
                                <Label for="qrHeader" class="text-sm sm:text-base font-medium">Header Title</Label>
                                {#if settings.qrHeaderTitle !== originalSettings.qrHeaderTitle}
                                    <span class="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-1 rounded">Unsaved</span>
                                {/if}
                            </div>
                            <Input id="qrHeader" bind:value={settings.qrHeaderTitle} placeholder="e.g., Your Organization Name" />
                            <p class="text-xs text-muted-foreground">Main title displayed at the top of the QR card.</p>
                        </div>

                        <div class="space-y-2">
                            <div class="flex items-center gap-2">
                                <Label for="qrSubheader" class="text-sm sm:text-base font-medium">Subheader Text</Label>
                                {#if settings.qrSubheaderTitle !== originalSettings.qrSubheaderTitle}
                                    <span class="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-1 rounded">Unsaved</span>
                                {/if}
                            </div>
                            <Input id="qrSubheader" bind:value={settings.qrSubheaderTitle} placeholder="e.g., Your tagline or mission" />
                            <p class="text-xs text-muted-foreground">Subtitle or tagline displayed below the main header.</p>
                        </div>

                        <div class="space-y-2">
                            <div class="flex items-center gap-2">
                                <Label for="qrCardColor" class="text-sm sm:text-base font-medium">Branding Color</Label>
                                {#if settings.qrCardColor !== originalSettings.qrCardColor}
                                    <span class="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-1 rounded">Unsaved</span>
                                {/if}
                            </div>
                            <div class="flex gap-3 items-center">
                                <ColorPicker
                                    bind:hex={settings.qrCardColor}
                                    label="Pick a color"
                                />
                            </div>
                            <p class="text-xs text-muted-foreground">The color used for text and branding on the generated QR cards.</p>
                        </div>

                        <div class="space-y-2">
                            <div class="flex items-center gap-2">
                                <Label for="qrBackground" class="text-sm sm:text-base font-medium">Background Image</Label>
                                <span class="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">Optional</span>
                            </div>
                            <div class="space-y-3">
                                {#if settings.qrBackgroundImage}
                                    <div class="group relative w-full bg-gradient-to-br from-muted to-muted/50 rounded-xl border-2 border-border/30 overflow-hidden shadow-md hover:shadow-lg transition-all duration-300">
                                        <!-- Image Container -->
                                        <div class="relative w-full h-48 overflow-hidden bg-muted">
                                            <img 
                                                src={settings.qrBackgroundImage} 
                                                alt="Background preview" 
                                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                            />
                                            <!-- Overlay Gradient -->
                                            <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                                        </div>
                                        
                                        <!-- Remove Button -->
                                        <button
                                            onclick={handleRemoveImage}
                                            class="absolute top-3 right-3 p-2 bg-red-500/90 hover:bg-red-600 text-white rounded-lg shadow-md transition-all duration-200 transform hover:scale-110 z-10"
                                            aria-label="Remove background image"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                        </button>

                                        <!-- Info Footer -->
                                        <div class="px-4 py-3 bg-muted/50 border-t border-border/20">
                                            <div class="flex items-center justify-between">
                                                <div class="flex items-center gap-2 text-sm">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L7 21"/></svg>
                                                    <span class="font-medium text-foreground">Image uploaded</span>
                                                </div>
                                                <button
                                                    onclick={() => document.getElementById('qrBackground').click()}
                                                    class="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                {:else}
                                    <label 
                                        for="qrBackground" 
                                        class="block group cursor-pointer"
                                        ondragover={handleDragOver}
                                        ondragleave={handleDragLeave}
                                        ondrop={handleDrop}
                                    >
                                        <div class={cn(
                                            "flex flex-col items-center justify-center w-full px-6 py-8 border-2 border-dashed rounded-xl transition-all duration-300 bg-muted/20",
                                            isDragging 
                                                ? "border-primary bg-primary/10 scale-105" 
                                                : "border-border/40 group-hover:border-primary/50 group-hover:bg-primary/5"
                                        )}>
                                            <div class="flex flex-col items-center justify-center gap-2">
                                                <div class={cn(
                                                    "p-3 rounded-lg transition-all",
                                                    isDragging 
                                                        ? "bg-primary/30 scale-110" 
                                                        : "bg-primary/10 group-hover:bg-primary/20"
                                                )}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cn(
                                                        "transition-colors",
                                                        isDragging ? "text-primary" : "text-primary"
                                                    )}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L7 21"/></svg>
                                                </div>
                                                {#if draggedFileName}
                                                    <div class="flex items-center gap-2">
                                                        <p class="text-sm font-semibold text-primary">{draggedFileName}</p>
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary animate-pulse"><polyline points="20 6 9 17 4 12"/></svg>
                                                    </div>
                                                    <p class="text-xs text-muted-foreground">Ready to upload</p>
                                                {:else}
                                                    <p class="text-sm font-semibold text-foreground">Upload Background Image</p>
                                                    <p class="text-xs text-muted-foreground">or drag and drop</p>
                                                {/if}
                                            </div>
                                            <div class="flex gap-2 mt-4 text-xs text-muted-foreground">
                                                <span class="px-2 py-1 bg-muted rounded-md font-medium">PNG</span>
                                                <span class="px-2 py-1 bg-muted rounded-md font-medium">JPG</span>
                                                <span class="px-2 py-1 bg-muted rounded-md font-medium">Max 5MB</span>
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
                            <p class="text-xs text-muted-foreground flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-60"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                                Used as background on generated QR cards. Visible in all exports.
                            </p>
                        </div>
                    </div>

                    <!-- Preview Side -->
                    <div class="flex flex-col items-center justify-center p-6 bg-muted/40 rounded-2xl border border-dashed border-border/50 min-h-100">
                        <div class="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-6">Live Preview</div>
                        
                        <!-- Mini QR Card Mock -->
                        <div class="w-75 h-75 bg-white rounded-xl shadow-xl border border-border/20 overflow-hidden flex flex-col items-center p-4 relative">
                            <!-- Background Image Overlay -->
                            {#if previewBackgroundDataUrl}
                                <div class="absolute inset-0 z-0">
                                    <img src={previewBackgroundDataUrl} alt="Background" class="w-full h-full object-cover" />
                                </div>
                            {/if}
                            <!-- Header Text -->
                            <div class="text-center mt-2 px-2 relative z-10">
                                <h4 class="text-[14px] leading-tight font-bold" style="color: {settings.qrCardColor}">
                                    {settings.qrHeaderTitle || 'HEADER TITLE'}
                                </h4>
                                <p class="text-[10px] italic mt-1 font-medium opacity-100" style="color: {settings.qrCardColor}">
                                    {settings.qrSubheaderTitle || 'Subheader goes here'}
                                </p>
                            </div>

                            <!-- Mock QR Code Box -->
                            <div class="mt-4 w-36 h-36 border-4 rounded-lg flex items-center justify-center bg-white relative z-10" style="border-color: {settings.qrCardColor}20">
                                <QrCode class="w-24 h-24 opacity-100" style="color: {settings.qrCardColor}" />
                            </div>

                            <!-- Member Name (Below QR) -->
                            <div class="mt-4 text-center relative z-10">
                                <div class="text-[12px] font-bold uppercase" style="color: {settings.qrCardColor}">Sample Member</div>
                            </div>

                            <!-- Member ID (Bottom) -->
                            <div class="mt-2 mb-4 text-center relative z-10">
                                <div class="text-[12px] font-black tracking-widest" style="color: {settings.qrCardColor}">ENG-1234</div>
                            </div>

                            <!-- BG Pattern Mock (Subtle) -->
                            <div class="absolute inset-0 -z-10 opacity-100 pointer-events-none overflow-hidden">
                                <div class="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl" style="background-color: {settings.qrCardColor}"></div>
                                <div class="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-3xl" style="background-color: {settings.qrCardColor}"></div>
                            </div>
                        </div>
                        <p class="text-[11px] text-muted-foreground mt-4 text-center">Generating a real image uses 1080x1080 resolution.</p>
                    </div>
                </div>
			</CardContent>
		</Card>
	</div>

	<!-- Action Buttons -->
	<div class="flex flex-col sm:flex-row gap-3">
		<Button 
			variant="outline" 
			class="w-full sm:flex-1 text-xs sm:text-sm"
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
        class="hidden md:flex fixed bottom-6 right-6 z-50 items-center gap-3 bg-card border border-border/50 p-2 pl-4 rounded-full shadow-lg shadow-black/5"
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
                <Save class="w-4 h-4 mr-2" />
                Save Changes
            {/if}
        </Button>
    </div>

    <!-- Fixed Save Button (Mobile) -->
    <div 
        transition:fly={{ y: 100, duration: 300 }}
        class="fixed left-4 right-4 bottom-4 md:hidden z-50"
    >
        <Button 
            class="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
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

<script lang="ts">
    import './layout.css';
    import { browser } from '$app/environment';
    // import favicon from '$lib/assets/favicon.svg';
    import AppSidebar from "$lib/components/app-sidebar.svelte";
    import { Separator } from "$lib/components/ui/separator";
    import {
        SidebarInset,
        SidebarProvider,
        SidebarTrigger,
    } from "$lib/components/ui/sidebar";
    import {
        Breadcrumb,
        BreadcrumbItem,
        BreadcrumbLink,
        BreadcrumbList,
        BreadcrumbPage,
        BreadcrumbSeparator,
    } from "$lib/components/ui/breadcrumb";
    import { page } from '$app/stores';
    import MobileNav from '$lib/components/mobile-nav.svelte';
    import MobileHeader from '$lib/components/mobile-header.svelte';
    import { Toaster } from "$lib/components/ui/sonner";
    import { onMount } from 'svelte';
    import { loadSettings, systemSettings } from "$lib/stores/settings";
    import { devTools } from "$lib/stores/dev";
    import { onboardingState } from "$lib/stores/onboarding";
    import { supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';
    import { updateCurrentSessionActivity, getCurrentSessionId } from '$lib/utils/sessions';
    import { pwaInfo } from 'virtual:pwa-info';

    // Initialize theme synchronously from localStorage before render
    if (browser) {
        const savedTheme = localStorage.getItem('theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    let { children } = $props();

    onMount(() => {
        // Register service worker if available
        if ('serviceWorker' in navigator && pwaInfo) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }

        let activityInterval: ReturnType<typeof setInterval>;

        (async () => {
            await loadSettings();
            devTools.init();
            
            // Global Auth Guard
            const { data: { session } } = await supabase.auth.getSession();
            const path = $page.url.pathname;
            const publicRoutes = ['/login', '/forgot-password'];

            if (!session && !publicRoutes.includes(path)) {
                goto('/login');
            } else if (session && publicRoutes.includes(path)) {
                goto('/');
            }

            // Update session activity on initial load
            if (session) {
                await updateCurrentSessionActivity();
            }

            // Update session activity every 5 minutes
            activityInterval = setInterval(async () => {
                await updateCurrentSessionActivity();
            }, 5 * 60 * 1000);

            // Listen for auth state changes
            supabase.auth.onAuthStateChange((event, session) => {
                 const currentPath = window.location.pathname; // $page might be stale in callback
                 if (event === 'SIGNED_OUT') {
                     // Clear session ID on logout
                     if (typeof window !== 'undefined') {
                         localStorage.removeItem('currentSessionId');
                     }
                     if (!publicRoutes.includes(currentPath)) goto('/login');
                     clearInterval(activityInterval);
                 } else if (event === 'SIGNED_IN' || session) {
                     if (publicRoutes.includes(currentPath)) goto('/');
                 }
            });
        })();

        return () => {
            clearInterval(activityInterval);
        };
    });

    // Determine if we should show the sidebar
    // Hide on login and forgot-password pages
    let showSidebar = $derived(!['/login', '/forgot-password'].includes($page.url.pathname));

    // Compute breadcrumb based on current path
    let breadcrumbs = $derived.by(() => {
        const path = $page.url.pathname;
        if (path === '/') return [{ name: 'Overview' }];
        
        // Settings/Options routes
        if (path === '/settings') return [{ name: 'Options' }];
        if (path === '/settings/profile') return [
            { name: 'Options', href: '/settings' },
            { name: 'Profile' }
        ];
        if (path === '/settings/app') return [
            { name: 'Options', href: '/settings' },
            { name: 'App Settings' }
        ];
        
        // Attendance routes (under Options)
        if (path === '/attendance') return [{ name: 'Attendance' }];
        if (path === '/attendance/history') return [
            { name: 'Options', href: '/settings' },
            { name: 'Attendance History' }
        ];
        
        // Events (under Options)
        if (path === '/events') return [
            { name: 'Options', href: '/settings' },
            { name: 'Events' }
        ];
        
        // Analytics (under Options)
        if (path === '/analytics') return [
            { name: 'Options', href: '/settings' },
            { name: 'Analytics' }
        ];
        
        // Groups (under Options)
        if (path === '/groups') return [
            { name: 'Options', href: '/settings' },
            { name: 'Groups' }
        ];

        // Notifications
        if (path === '/notifications') return [{ name: 'Notifications' }];
        
        // Scan
        if (path === '/scan') return [{ name: 'Scan' }];
        
        // Members
        if (path === '/members') return [{ name: 'Members' }];
        

        
        // History
        if (path === '/history') return [{ name: 'History' }];
        
        // Default: capitalize the first segment
        const segment = path.split('/')[1];
        if (!segment) return [{ name: 'Overview' }];
        return [{ name: segment.charAt(0).toUpperCase() + segment.slice(1) }];
    });
</script>

<svelte:head>
    {@html pwaInfo?.webManifest.linkTag}
    <link rel="icon" href="/favicon.svg?v={Date.now()}" />
    <title>{$systemSettings.siteName}</title>
</svelte:head>
<Toaster position="top-center" />

{#if showSidebar}
    <SidebarProvider>
        <AppSidebar />
        <SidebarInset class="bg-background">
            <!-- Desktop Header -->
            <header class="hidden md:flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b border-border/40">
                <div class="flex items-center gap-2 px-4">
                    <SidebarTrigger class="-ml-1" />
                    <Separator orientation="vertical" class="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem class="hidden md:block">
                                <BreadcrumbLink href="/">{$systemSettings.siteName}</BreadcrumbLink>
                            </BreadcrumbItem>
                            {#each breadcrumbs as crumb, i}
                                <BreadcrumbSeparator class="hidden md:block" />
                                <BreadcrumbItem>
                                    {#if crumb.href}
                                        <BreadcrumbLink href={crumb.href}>{crumb.name}</BreadcrumbLink>
                                    {:else}
                                        <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                                    {/if}
                                </BreadcrumbItem>
                            {/each}
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            </header>

            <!-- Custom Mobile Header -->
            <MobileHeader title={breadcrumbs[breadcrumbs.length - 1].name} />

            <main class="flex flex-1 flex-col gap-4 p-4 pt-0 pb-24 md:pb-0">
                {@render children()}
            </main>
            <!-- Mobile bottom navigation - Hidden when onboarding is active -->
            {#if !$onboardingState.isOpen}
                <MobileNav class="md:hidden" />
            {/if}
        </SidebarInset>
    </SidebarProvider>
{:else}
    {@render children()}
{/if}

{#if $devTools.isMockTimeActive}
    <div class="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-100 bg-orange-500 text-white text-[10px] md:text-xs px-3 py-1.5 rounded-full font-mono font-bold shadow-lg flex items-center gap-2 pointer-events-none border-2 border-orange-400 animate-in fade-in slide-in-from-bottom-4">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        MOCK TIME: {$devTools.mockTime?.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
    </div>
{/if}

<Toaster position="top-center" richColors />

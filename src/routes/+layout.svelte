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
    import { supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';

    // Initialize theme synchronously from localStorage before render
    if (browser) {
        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    let { children } = $props();

    onMount(async () => {
        await loadSettings();
        
        // Global Auth Guard
        const { data: { session } } = await supabase.auth.getSession();
        const path = $page.url.pathname;
        const publicRoutes = ['/login', '/forgot-password'];

        if (!session && !publicRoutes.includes(path)) {
            goto('/login');
        } else if (session && publicRoutes.includes(path)) {
            goto('/');
        }

        // Listen for auth state changes
        supabase.auth.onAuthStateChange((event, session) => {
             const currentPath = window.location.pathname; // $page might be stale in callback
             if (event === 'SIGNED_OUT') {
                 if (!publicRoutes.includes(currentPath)) goto('/login');
             } else if (event === 'SIGNED_IN' || session) {
                 if (publicRoutes.includes(currentPath)) goto('/');
             }
        });
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
        
        // Dashboard
        if (path === '/dashboard') return [{ name: 'Dashboard' }];
        
        // History
        if (path === '/history') return [{ name: 'History' }];
        
        // Default: capitalize the first segment
        const segment = path.split('/')[1];
        if (!segment) return [{ name: 'Overview' }];
        return [{ name: segment.charAt(0).toUpperCase() + segment.slice(1) }];
    });
</script>

<svelte:head>
    <link rel="icon" href="/favicon.svg" />
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
            <!-- Mobile bottom navigation -->
            <MobileNav class="md:hidden" />
        </SidebarInset>
    </SidebarProvider>
{:else}
    {@render children()}
{/if}

<Toaster />

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

    // Determine if we should show the sidebar
    // Hide on login and forgot-password pages
    let showSidebar = $derived(!['/login', '/forgot-password'].includes($page.url.pathname));

    // Compute breadcrumb based on current path
    let breadcrumbs = $derived.by(() => {
        const path = $page.url.pathname;
        if (path === '/') return [{ name: 'Overview' }];
        
        if (path === '/settings') return [{ name: 'Options' }];
        if (path.startsWith('/attendance/history')) return [
            { name: 'Options', href: '/settings' },
            { name: 'Attendance History' }
        ];
        if (path === '/events') return [
            { name: 'Options', href: '/settings' },
            { name: 'Events' }
        ];
        
        const segment = path.split('/')[1];
        if (!segment) return [{ name: 'Overview' }];
        if (segment === 'members') return [{ name: 'Members' }];
        if (segment === 'dashboard') return [{ name: 'Dashboard' }];
        return [{ name: segment.charAt(0).toUpperCase() + segment.slice(1) }];
    });
</script>

<svelte:head><link rel="icon" href="/favicon.svg" /></svelte:head>
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
                                <BreadcrumbLink href="/">Scan-in System</BreadcrumbLink>
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

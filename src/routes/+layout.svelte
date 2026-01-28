<script lang="ts">
    import './layout.css';
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

    let { children } = $props();

    // Determine if we should show the sidebar
    // Hide on login and forgot-password pages
    let showSidebar = $derived(!['/login', '/forgot-password'].includes($page.url.pathname));

    // Compute breadcrumb based on current path
    let currentPageName = $derived.by(() => {
        const path = $page.url.pathname;
        if (path === '/') return 'Overview';
        
        const segment = path.split('/')[1];
        if (!segment) return 'Overview';
        return segment.charAt(0).toUpperCase() + segment.slice(1);
    });
</script>

<svelte:head><link rel="icon" href="/favicon.svg" /></svelte:head>

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
                                <BreadcrumbLink href="#">Scan-in System</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator class="hidden md:block" />
                            <BreadcrumbItem>
                                <BreadcrumbPage>{currentPageName}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            </header>

            <!-- Custom Mobile Header -->
            <MobileHeader />

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

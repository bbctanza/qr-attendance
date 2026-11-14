<script lang="ts">
	import './layout.css';
	import { browser } from '$app/environment';
	// import favicon from '$lib/assets/favicon.svg';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { SidebarInset, SidebarProvider, SidebarTrigger } from '$lib/components/ui/sidebar';
	import {
		Breadcrumb,
		BreadcrumbItem,
		BreadcrumbLink,
		BreadcrumbList,
		BreadcrumbPage,
		BreadcrumbSeparator
	} from '$lib/components/ui/breadcrumb';
	import { page } from '$app/stores';
	import MobileNav from '$lib/components/mobile-nav.svelte';
	import MobileHeader from '$lib/components/mobile-header.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onMount } from 'svelte';
	import { loadSettings, systemSettings } from '$lib/stores/settings';
	import { devTools } from '$lib/stores/dev';
	import { kioskMode } from '$lib/stores/kiosk';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { touchSession } from '$lib/utils/sessions';
	import { pwaInfo } from 'virtual:pwa-info';
	import { CURRENT_VERSION } from '$lib/config/changelog';

	// Initialize theme synchronously from localStorage before render
	if (browser) {
		const savedTheme = localStorage.getItem('theme');

		if (savedTheme === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}

	let { children } = $props();

	onMount(() => {
		// Register service worker if available (skip in development)
		if ('serviceWorker' in navigator && pwaInfo && !import.meta.env.DEV) {
			navigator.serviceWorker.register('/sw.js', { scope: '/' });
		}

		let activityInterval: ReturnType<typeof setInterval>;

		(async () => {
			devTools.init();
			kioskMode.init();

			// Run settings and session checks in parallel
			const [_, authRes] = await Promise.all([loadSettings(), supabase.auth.getSession()]);

			const session = authRes.data?.session;
			const path = $page.url.pathname;
			const publicRoutes = ['/', '/login', '/forgot-password'];
			const isPublicRoute =
				publicRoutes.includes(path) ||
				path.startsWith('/check-in/') ||
				path.startsWith('/display/');

			if (!session && !isPublicRoute) {
				goto('/login');
			} else if (session && publicRoutes.includes(path) && (path === '/' || path === '/login')) {
				goto('/overview');
			}

			// Keep this device's last-active timestamp fresh so it doesn't look stale in the
			// Active Sessions list. Revocation is handled by the watchdog in (protected).
			if (session) {
				touchSession().catch(console.error);
			}

			activityInterval = setInterval(
				async () => {
					await touchSession();
				},
				5 * 60 * 1000
			);

			// Listen for auth state changes
			supabase.auth.onAuthStateChange((event, session) => {
				const currentPath = window.location.pathname; // $page might be stale in callback
				const isPublic =
					publicRoutes.includes(currentPath) ||
					currentPath.startsWith('/check-in/') ||
					currentPath.startsWith('/display/');
				if (event === 'SIGNED_OUT') {
					if (!isPublic) goto('/login');
					clearInterval(activityInterval);
				} else if (event === 'SIGNED_IN' || session) {
					if (currentPath === '/' || currentPath === '/login') goto('/overview');
				}
			});
		})();

		return () => {
			clearInterval(activityInterval);
		};
	});

	// Determine if we should show the sidebar
	// Hide on login (root), forgot-password, account setup, display pages, and self check-in
	let showSidebar = $derived(
		!['/'].includes($page.url.pathname) &&
			!$page.url.pathname.startsWith('/login') &&
			!$page.url.pathname.startsWith('/forgot-password') &&
			!$page.url.pathname.startsWith('/welcome') &&
			!$page.url.pathname.startsWith('/check-in/') &&
			!$page.url.pathname.startsWith('/display/') &&
			// A kiosk device has no one to navigate it - sidebar, breadcrumb and bottom nav
			// would just be more surface area for whoever's standing at it to tap into.
			!$kioskMode.enabled &&
			browser
	);

	// Kiosk boots straight into the scanner, every time - a page reload (the normal way a
	// kiosk laptop recovers from being left on overnight) must land back on /scan, not
	// wherever the tab happened to be when it last closed.
	$effect(() => {
		if ($kioskMode.enabled && browser && $page.url.pathname !== '/scan') {
			goto('/scan', { replaceState: true });
		}
	});

	// Force light mode for check-in and display routes
	$effect(() => {
		const path = $page.url.pathname;
		if (path.startsWith('/check-in/') || path.startsWith('/display/')) {
			document.documentElement.classList.remove('dark');
		} else {
			// Restore theme for other routes
			const savedTheme = localStorage.getItem('theme');
			if (savedTheme === 'dark') {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		}
	});

	// Compute breadcrumb based on current path
	let breadcrumbs = $derived.by(() => {
		const path = $page.url.pathname;
		if (path === '/overview') return [{ name: 'Overview' }];

		// Settings/Options routes
		if (path === '/settings') return [{ name: 'Options' }];
		if (path === '/settings/profile')
			return [{ name: 'Options', href: '/settings' }, { name: 'Profile' }];
		if (path === '/settings/app')
			return [{ name: 'Options', href: '/settings' }, { name: 'App Settings' }];
		if (path === '/settings/access')
			return [{ name: 'Options', href: '/settings' }, { name: 'Access Directory' }];
		if (path === '/settings/devices/history')
			return [
				{ name: 'Options', href: '/settings' },
				{ name: 'Kiosk Devices', href: '/settings/devices' },
				{ name: 'History' }
			];
		if (path === '/settings/devices')
			return [{ name: 'Options', href: '/settings' }, { name: 'Kiosk Devices' }];
		if (path === '/settings/dev')
			return [{ name: 'Options', href: '/settings' }, { name: 'Developer Tools' }];
		if (path === '/settings/audit-logs')
			return [{ name: 'Options', href: '/settings' }, { name: 'Audit Logs' }];

		// Attendance routes (under Options)
		if (path === '/attendance') return [{ name: 'Attendance' }];
		if (path === '/attendance/history')
			return [{ name: 'Options', href: '/settings' }, { name: 'Attendance History' }];

		// Events (under Options)
		if (path === '/events') return [{ name: 'Options', href: '/settings' }, { name: 'Events' }];

		// Analytics (under Options)
		if (path === '/analytics')
			return [{ name: 'Options', href: '/settings' }, { name: 'Analytics' }];

		// Groups (under Options)
		if (path === '/groups') return [{ name: 'Options', href: '/settings' }, { name: 'Groups' }];

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
	<!-- Keyed to the release, not the clock. Date.now() differed between the server render
	     and hydration a few milliseconds later, and re-downloaded the icon on every page load. -->
	<link rel="icon" href="/favicon.svg?v={CURRENT_VERSION}" />
	<title>{$systemSettings.siteName}</title>
</svelte:head>

{#if $devTools.bypassEventTimeValidation}
	<div
		class="relative z-[100] flex w-full animate-in items-center justify-center gap-2 bg-orange-500 px-3 py-2 font-mono text-[10px] font-bold text-white shadow-md fade-in slide-in-from-top-4 md:text-xs"
	>
		<span class="relative flex h-2 w-2">
			<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"
			></span>
			<span class="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
		</span>
		EVENT TIME VALIDATION BYPASSED
	</div>
{/if}

{#if showSidebar}
	<SidebarProvider>
		<AppSidebar />
		<SidebarInset class="bg-background">
			<!-- Desktop Header -->
			<header
				class="hidden h-16 shrink-0 items-center gap-2 border-b border-border/40 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:flex"
			>
				<div class="flex items-center gap-2 px-4">
					<SidebarTrigger class="-ml-1" />
					<Separator orientation="vertical" class="mr-2 h-4" />
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem class="hidden md:block">
								<BreadcrumbLink href="/overview">{$systemSettings.siteName}</BreadcrumbLink>
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
			{#if breadcrumbs && breadcrumbs.length > 0}
				<!-- A trail longer than one means this page has a parent, which is what turns the
				     menu button into a back arrow. Derived here so no page declares it. -->
				<MobileHeader
					title={breadcrumbs[breadcrumbs.length - 1].name}
					backTo={breadcrumbs.length > 1
						? (breadcrumbs[0].href ?? null)
						: // Notifications is reached from the bell on every page, so it has no parent
							// in the trail - but it is still somewhere you leave, and the bottom nav
							// does not list it. Overview is the predictable way out.
							$page.url.pathname === '/notifications'
							? '/overview'
							: null}
				/>
			{/if}

			<!-- No padding here on purpose: every page already supplies its own, and having both
			     doubled the margins on phones. Only the bottom-nav clearance belongs at this level.

			     pb-32, not pb-24: the clearance has to cover the scan button, not the bar. The bar
			     measures 97px, but the FAB is pulled up with `-top-8` and carries a `ring-4`, so the
			     chrome's real top edge is 120px above the viewport bottom. At pb-24 (96px) the last
			     12px of page content sat behind an opaque circle, dead centre - which is exactly
			     where a stacked pagination footer puts its Previous/Next row.
			     Measured in mobile-nav-clearance.svelte.test.ts. -->
			<main class="flex flex-1 flex-col pb-32 md:pb-0">
				{@render children()}
			</main>
			<MobileNav class="md:hidden" />
		</SidebarInset>
	</SidebarProvider>
{:else}
	{@render children()}
{/if}

<Toaster position="top-center" richColors expand={true} />

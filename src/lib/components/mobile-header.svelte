<script lang="ts">
	import { Menu, Bell, User, ArrowLeft } from 'lucide-svelte';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { unreadCount } from '$lib/stores/notifications';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';

	interface Props {
		title?: string;
		/**
		 * Parent route, when this page has one. Supplied by the layout from the breadcrumb
		 * trail, so no page has to declare it.
		 */
		backTo?: string | null;
	}

	let { title = 'Overview', backTo = null }: Props = $props();

	const sidebar = useSidebar();

	/**
	 * A child page gets a back arrow where a top-level page gets the menu.
	 *
	 * Previously only /notifications did this, as a hard-coded special case, so every other
	 * detail page had to hand-roll its own back button inside the page body - which is how
	 * they ended up inconsistent with each other and absent on Audit Logs.
	 */
	let showBack = $derived(Boolean(backTo));

	let userProfile = $state({
		name: '',
		email: '',
		avatar: ''
	});

	onMount(async () => {
		try {
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (user) {
				const { data: prof } = await supabase
					.from('profiles')
					.select('*')
					.eq('id', user.id)
					.single();

				if (prof) {
					userProfile = {
						name: prof.full_name || user.user_metadata?.full_name || 'User',
						email: user.email || '',
						avatar: prof.avatar_url || user.user_metadata?.avatar_url || ''
					};
				} else {
					userProfile = {
						name: user.user_metadata?.full_name || 'User',
						email: user.email || '',
						avatar: user.user_metadata?.avatar_url || ''
					};
				}
			}
		} catch (e) {
			// Silently fail, use defaults
		}
	});
</script>

<header
	class="sticky top-0 z-40 flex items-center justify-between border-b border-border/40 bg-background px-6 py-4 md:hidden"
>
	<div class="flex items-center gap-4">
		{#if showBack}
			<!-- An explicit destination rather than history.back(), so arriving by deep link or
			     refresh still goes somewhere sensible instead of leaving the app. -->
			<a
				href={backTo}
				aria-label="Back"
				class="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
			>
				<ArrowLeft class="h-5 w-5" />
			</a>
		{:else}
			<button
				aria-label="Open menu"
				class="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
				onclick={() => sidebar.toggle()}
			>
				<Menu class="h-5 w-5" />
			</button>
		{/if}
		<h1 class="truncate text-xl font-bold tracking-tight">{title}</h1>
	</div>

	<div class="flex items-center gap-3">
		{#if $page.url.pathname !== '/notifications'}
			<a
				href="/notifications"
				class="relative flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground transition-transform active:scale-95"
			>
				<Bell class="h-5 w-5" />
				{#if $unreadCount > 0}
					<span
						class="absolute top-2.5 right-2.5 h-2 w-2 rounded-full border-2 border-background bg-primary"
					></span>
				{/if}
			</a>
		{/if}

		<a href="/settings/profile" class="block transition-transform active:scale-95">
			<Avatar class="h-10 w-10 border-2 border-primary/20">
				{#if userProfile.avatar}
					<AvatarImage src={userProfile.avatar} alt={userProfile.name} />
				{/if}
				<AvatarFallback>{(userProfile.name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
			</Avatar>
		</a>
	</div>
</header>

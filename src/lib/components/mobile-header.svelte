<script lang="ts">
  import { Menu, Bell, User, ArrowLeft } from 'lucide-svelte';
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
  import { unreadCount } from "$lib/stores/notifications";
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';

  interface Props {
    title?: string;
  }

  let { title = 'Overview' } = $props();

  const sidebar = useSidebar();
  
  // Check if we are on the notifications page
  let isNotificationsPage = $derived($page.url.pathname === '/notifications');

  let userProfile = $state({
    name: '',
    email: '',
    avatar: ''
  });

  onMount(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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

<header class="flex items-center justify-between px-6 py-4 bg-background sticky top-0 z-40 md:hidden border-b border-border/40">
  <div class="flex items-center gap-4">
    {#if isNotificationsPage}
        <button 
          class="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground active:scale-95 transition-transform"
          onclick={() => history.back()}
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        <h1 class="text-xl font-bold tracking-tight">Notifications</h1>
    {:else}
        <button 
          class="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground active:scale-95 transition-transform"
          onclick={() => sidebar.toggle()}
        >
          <Menu class="h-5 w-5" />
        </button>
        <h1 class="text-xl font-bold tracking-tight">{title}</h1>
    {/if}
  </div>

  <div class="flex items-center gap-3">
    {#if !isNotificationsPage}
        <a 
            href="/notifications" 
            class="relative flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground active:scale-95 transition-transform"
        >
            <Bell class="h-5 w-5" />
            {#if $unreadCount > 0}
                <span class="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-primary border-2 border-background"></span>
            {/if}
        </a>
    {/if}
    
    <a href="/settings/profile" class="block active:scale-95 transition-transform">
      <Avatar class="h-10 w-10 border-2 border-primary/20">
        {#if userProfile.avatar}
          <AvatarImage src={userProfile.avatar} alt={userProfile.name} />
        {/if}
        <AvatarFallback>{(userProfile.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
    </a>
  </div>
</header>

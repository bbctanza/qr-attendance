<script lang="ts">
  import { page } from '$app/stores';
  import {
    LayoutDashboard,
    Users,
    ListChecks,
    MoreHorizontal,
    QrCode,
    LogOut,
    ChevronUp,
    User2
  } from "@lucide/svelte";
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
    SidebarRail
  } from "$lib/components/ui/sidebar";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
  import { siteConfig } from '$lib/config/site';
  import { goto } from '$app/navigation';
  import { systemSettings } from '$lib/stores/settings';
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';

  // Menu items
  const items = [
    {
      title: "Overview",
      url: "/",
      icon: LayoutDashboard,
    },
    {
      title: "Members",
      url: "/members",
      icon: Users,
    },
    {
      title: "Scan",
      url: "/scan",
      icon: QrCode,
    },
    {
      title: "Attendance",
      url: "/attendance",
      icon: ListChecks,
    },
    {
      title: "Options",
      url: "/settings",
      icon: MoreHorizontal,
    },
  ];

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

  async function handleLogout() {
    await supabase.auth.signOut();
    goto('/login');
  }
</script>

<Sidebar>
  <SidebarHeader>
    <SidebarMenu>
        <SidebarMenuItem>
            <div class="flex items-center gap-2 px-2 py-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <QrCode class="size-4" />
                </div>
                <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold text-sidebar-foreground">{$systemSettings.siteName}</span>
                    <span class="truncate text-xs text-sidebar-foreground/70">Admin Panel</span>
                </div>
            </div>
        </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>

  <SidebarContent>
    <SidebarGroup>
      <SidebarGroupLabel>Menu</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {#each items as item}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={$page.url.pathname === item.url}
                onclick={() => goto(item.url)}
              >
                <item.icon class="size-4" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          {/each}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>

  <SidebarFooter>
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
                <SidebarMenuButton
                    size="lg"
                    class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    {...props}
                >
                <Avatar class="h-8 w-8 rounded-lg">
                    {#if userProfile.avatar}
                      <AvatarImage src={userProfile.avatar} alt={userProfile.name} />
                    {/if}
                    <AvatarFallback class="rounded-lg">{(userProfile.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold">{userProfile.name || 'User'}</span>
                    <span class="truncate text-xs">{userProfile.email || 'No email'}</span>
                </div>
                <ChevronUp class="ml-auto size-4" />
                </SidebarMenuButton>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            class="w-[--sidebar-width] min-w-56 rounded-lg bg-popover text-popover-foreground shadow-lg"
          >
            <DropdownMenuItem onclick={() => goto('/settings/profile')}>
              <User2 class="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onclick={handleLogout} class="text-destructive focus:text-destructive">
              <LogOut class="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
  <SidebarRail />
</Sidebar>

<script lang="ts">
  import { page } from '$app/stores';
  import {
    LayoutDashboard,
    Users,
    History,
    Settings,
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
      title: "History",
      url: "/history",
      icon: History,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    },
  ];
</script>

<Sidebar>
  <SidebarHeader>
    <SidebarMenu>
        <SidebarMenuItem>
            <div class="flex items-center gap-2 px-2 py-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <QrCode class="size-4" />
                </div>
                <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold">{siteConfig.name}</span>
                    <span class="truncate text-xs text-muted-foreground">Admin Panel</span>
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
                    <AvatarImage src="https://github.com/shadcn.png" alt="User" />
                    <AvatarFallback class="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold">Admin User</span>
                    <span class="truncate text-xs">admin@example.com</span>
                </div>
                <ChevronUp class="ml-auto size-4" />
                </SidebarMenuButton>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            class="w-[--sidebar-width] min-w-56 rounded-lg"
          >
            <DropdownMenuItem>
              <span>Account</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <span>Billing</span>
            </DropdownMenuItem>
            <!-- <DropdownMenuItem class="text-destructive focus:text-destructive">
              <LogOut class="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem> -->
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
  <SidebarRail />
</Sidebar>

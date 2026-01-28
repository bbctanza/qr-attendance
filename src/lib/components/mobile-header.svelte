<script lang="ts">
  import { Menu, Bell, User } from 'lucide-svelte';
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";

  export let title: string = 'Overview';

  const sidebar = useSidebar();
</script>

<header class="flex items-center justify-between px-6 py-4 bg-background sticky top-0 z-40 md:hidden">
  <div class="flex items-center gap-4">
    <button 
      class="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground active:scale-95 transition-transform"
      onclick={() => sidebar.toggle()}
    >
      <Menu class="h-5 w-5" />
    </button>
    <h1 class="text-xl font-bold tracking-tight">{title}</h1>
  </div>

  <div class="flex items-center gap-3">
    <button class="relative flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-foreground active:scale-95 transition-transform">
      <Bell class="h-5 w-5" />
      <span class="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-primary border-2 border-background"></span>
    </button>
    <Avatar class="h-10 w-10 border-2 border-primary/20">
      <AvatarImage src="https://github.com/shadcn.png" alt="User profile" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  </div>
</header>

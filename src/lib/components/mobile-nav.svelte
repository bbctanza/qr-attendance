<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { LayoutGrid, Users, QrCode, History, Settings } from 'lucide-svelte';
  import { cn } from '$lib/utils';

  let { class: className = "" } = $props();

  let activePath = $derived($page.url.pathname);

  function isActive(path: string) {
    if (path === '/' && activePath === '/') return true;
    if (path !== '/' && activePath.startsWith(path)) return true;
    return false;
  }
</script>

<nav class={cn("fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 bg-background/80 backdrop-blur-xl border-t border-border/10 md:hidden", className)}>
  <div class="flex items-center justify-between max-w-lg mx-auto">
    <button 
      class="flex flex-col items-center gap-1 w-16 transition-colors {isActive('/') ? 'text-primary' : 'text-muted-foreground'}" 
      onclick={() => goto('/dashboard') }
    >
      <LayoutGrid class="h-6 w-6" />
      <span class="text-[10px] font-medium">Home</span>
    </button>

    <button 
      class="flex flex-col items-center gap-1 w-16 transition-colors {isActive('/members') ? 'text-primary' : 'text-muted-foreground'}" 
      onclick={() => goto('/members') }
    >
      <Users class="h-6 w-6" />
      <span class="text-[10px] font-medium">Members</span>
    </button>

    <button 
        class="relative -top-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 active:scale-95 transition-all outline-none ring-4 ring-background"
        onclick={() => goto('/scan') }
    >
        <QrCode class="h-7 w-7" />
    </button>

    <button 
      class="flex flex-col items-center gap-1 w-16 transition-colors {isActive('/history') ? 'text-primary' : 'text-muted-foreground'}" 
      onclick={() => goto('/history') }
    >
      <History class="h-6 w-6" />
      <span class="text-[10px] font-medium">History</span>
    </button>

    <button 
      class="flex flex-col items-center gap-1 w-16 transition-colors {isActive('/settings') ? 'text-primary' : 'text-muted-foreground'}" 
      onclick={() => goto('/settings') }
    >
      <Settings class="h-6 w-6" />
      <span class="text-[10px] font-medium">Settings</span>
    </button>
  </div>
</nav>

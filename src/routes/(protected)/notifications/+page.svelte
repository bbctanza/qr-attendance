<script lang="ts">
    import { notifications, unreadCount } from "$lib/stores/notifications";
    import { Button } from "$lib/components/ui/button";
    import { Bell, Check, Trash2, Info, AlertTriangle, CheckCircle, AlertCircle, ArrowLeft, X } from 'lucide-svelte';
    import { onMount } from "svelte";
    import { formatLocalTime } from '$lib/utils/time';

    function formatDate(iso: string) {
        try {
            const date = new Date(iso);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            
            // If less than 24 hours
            if (diff < 86400000) {
                // Approximate time ago
                if (diff < 60000) return 'Just now';
                if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                return `${Math.floor(diff / 3600000)}h ago`;
            }
            return date.toLocaleDateString();
        } catch (e) {
            return 'Recently';
        }
    }
</script>

<div class="flex flex-col min-h-screen bg-background pb-20 md:pb-0">
    <!-- Header Actions -->
    <div class="px-5 py-5 flex items-center justify-between border-b border-border/40 bg-card/10 backdrop-blur-sm sticky top-0 z-10">
        <div class="flex flex-col">
            <h1 class="text-xl font-black tracking-tight uppercase italic text-primary">Inbox</h1>
            <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Activity</span>
                {#if $unreadCount > 0}
                    <div class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                    <span class="text-[10px] font-bold text-primary uppercase">{$unreadCount} New</span>
                {/if}
            </div>
        </div>
        <div class="flex gap-2">
            {#if $unreadCount > 0}
                <Button 
                    variant="ghost" 
                    size="sm" 
                    class="h-9 px-3 text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 hover:text-primary transition-all rounded-xl"
                    onclick={() => notifications.markAllAsRead()}
                >
                    <Check class="mr-1.5 h-3.5 w-3.5" /> Mark read
                </Button>
            {/if}
            {#if $notifications.length > 0}
                <Button 
                    variant="ghost" 
                    size="icon" 
                    class="h-9 w-9 rounded-xl text-muted-foreground hover:bg-destructive/5 hover:text-destructive transition-all"
                    onclick={() => notifications.clear()} 
                    title="Clear all"
                >
                    <Trash2 class="h-4 w-4" />
                </Button>
            {/if}
        </div>
    </div>

    <!-- Notification List -->
    <div class="flex-1 px-4 py-6 space-y-4">
        {#if $notifications.length === 0}
            <div class="flex flex-col items-center justify-center py-32 text-center">
                <div class="p-6 bg-muted/20 rounded-full mb-6">
                    <Bell class="h-10 w-10 text-muted-foreground/40" />
                </div>
                <h3 class="font-bold text-xl tracking-tight">Zero alerts</h3>
                <p class="text-sm text-muted-foreground mt-1 max-w-50">We'll let you know when something important happens.</p>
            </div>
        {:else}
            {#each $notifications as note (note.id)}
                <div class="relative group">
                    <button 
                        class="w-full text-left bg-card/30 border border-border/40 rounded-2xl p-4 flex gap-4 transition-all active:scale-[0.98] {note.read ? 'opacity-60 grayscale-[0.3]' : 'shadow-lg shadow-primary/5 hover:bg-card/50 ring-1 ring-primary/5'}"
                        onclick={() => notifications.markAsRead(note.id)}
                    >
                        <div class="mt-1 shrink-0">
                            {#if note.type === 'success'}
                                <div class="p-3 bg-primary/10 rounded-2xl text-primary">
                                    <CheckCircle class="h-5 w-5" />
                                </div>
                            {:else if note.type === 'warning'}
                                <div class="p-3 bg-amber-500/10 rounded-2xl text-amber-500">
                                    <AlertTriangle class="h-5 w-5" />
                                </div>
                            {:else if note.type === 'error'}
                                <div class="p-3 bg-destructive/10 rounded-2xl text-destructive">
                                    <AlertCircle class="h-5 w-5" />
                                </div>
                            {:else}
                                <div class="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                                    <Info class="h-5 w-5" />
                                </div>
                            {/if}
                        </div>
                        <div class="flex-1 min-w-0 pr-4">
                            <div class="flex items-center justify-between mb-0.5">
                                <h4 class="font-bold text-sm tracking-tight {note.read ? 'text-muted-foreground' : 'text-foreground'}">{note.title}</h4>
                                <span class="text-[10px] font-semibold text-muted-foreground uppercase opacity-60">{formatDate(note.timestamp)}</span>
                            </div>
                            <p class="text-xs text-muted-foreground leading-relaxed {note.read ? '' : 'text-foreground/80'}">{note.message}</p>
                        </div>
                        
                        {#if !note.read}
                            <div class="absolute right-4 top-1/2 -translate-y-1/2">
                                <div class="h-2 w-2 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]"></div>
                            </div>
                        {/if}
                    </button>
                    
                    <button 
                        onclick={(e) => {
                            e.stopPropagation();
                            notifications.remove(note.id);
                        }}
                        class="absolute -top-1 -right-1 p-1.5 bg-background border border-border/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground z-20"
                    >
                        <Trash2 class="h-3 w-3" />
                    </button>
                </div>
            {/each}
        {/if}
    </div>
</div>

<script lang="ts">
    import { notifications, unreadCount } from "$lib/stores/notifications";
    import { Button } from "$lib/components/ui/button";
    import { Bell, Check, Trash2, Info, AlertTriangle, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-svelte';
    import { onMount } from "svelte";
    import { formatLocalTime } from '$lib/utils/time';

    async function formatDate(iso: string) {
        const date = new Date(iso);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        // If less than 24 hours
        if (diff < 86400000) {
            return await formatLocalTime(date.toISOString());
        }
        return date.toLocaleDateString();
    }
</script>

<div class="flex flex-col min-h-screen bg-background pb-20 md:pb-0">
    <!-- Header Actions -->
    <div class="px-4 py-4 flex items-center justify-between border-b border-border/40">
        <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold">Recent</h2>
            {#if $unreadCount > 0}
                <span class="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-bold">{$unreadCount} new</span>
            {/if}
        </div>
        <div class="flex gap-2">
            {#if $unreadCount > 0}
                <Button variant="outline" size="sm" onclick={() => notifications.markAllAsRead()}>
                    <Check class="mr-2 h-4 w-4" /> Mark all read
                </Button>
            {/if}
            {#if $notifications.length > 0}
                <Button variant="ghost" size="icon" onclick={() => notifications.clear()} title="Clear all">
                    <Trash2 class="h-4 w-4 text-muted-foreground" />
                </Button>
            {/if}
        </div>
    </div>

    <!-- Notification List -->
    <div class="flex-1 px-4 py-4 space-y-3">
        {#if $notifications.length === 0}
            <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
                    <Bell class="h-8 w-8" />
                </div>
                <h3 class="font-semibold text-lg">No notifications</h3>
                <p class="text-sm">You're all caught up!</p>
            </div>
        {:else}
            {#each $notifications as note (note.id)}
                <button 
                    class="w-full text-left bg-card border border-border/50 rounded-xl p-4 flex gap-4 transition-all active:scale-[0.98] {note.read ? 'opacity-70' : 'shadow-sm border-l-4 border-l-primary'}"
                    onclick={() => notifications.markAsRead(note.id)}
                >
                    <div class="mt-1 shrink-0">
                        {#if note.type === 'success'}
                            <div class="p-2 bg-green-500/10 rounded-full text-green-600">
                                <CheckCircle class="h-5 w-5" />
                            </div>
                        {:else if note.type === 'warning'}
                            <div class="p-2 bg-amber-500/10 rounded-full text-amber-600">
                                <AlertTriangle class="h-5 w-5" />
                            </div>
                        {:else if note.type === 'error'}
                            <div class="p-2 bg-red-500/10 rounded-full text-red-600">
                                <AlertCircle class="h-5 w-5" />
                            </div>
                        {:else}
                            <div class="p-2 bg-blue-500/10 rounded-full text-blue-600">
                                <Info class="h-5 w-5" />
                            </div>
                        {/if}
                    </div>
                    <div class="flex-1 min-w-0 space-y-1">
                        <div class="flex items-center justify-between">
                            <h4 class="font-semibold text-sm truncate pr-2 {note.read ? 'text-muted-foreground' : 'text-foreground'}">{note.title}</h4>
                            <span class="text-[10px] text-muted-foreground shrink-0">{formatDate(note.timestamp)}</span>
                        </div>
                        <p class="text-sm text-muted-foreground leading-relaxed line-clamp-2">{note.message}</p>
                    </div>
                    {#if !note.read}
                        <div class="shrink-0 mt-3">
                            <div class="h-2 w-2 bg-primary rounded-full"></div>
                        </div>
                    {/if}
                </button>
            {/each}
        {/if}
    </div>
</div>

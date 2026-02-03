<script lang="ts">
    import { supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/state';

    let { children } = $props();
    let isLoading = $state(true);

    onMount(() => {
        let mounted = true;

        // Set up a listener for auth changes synchronously to ensure we catch everything
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                goto('/login');
            }
        });

        // Check the session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!mounted) return;
            if (!session) {
                goto('/login');
            } else {
                isLoading = false;
            }
        }).catch((e) => {
            console.error(e);
            goto('/login');
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    });
</script>

{#if isLoading}
    <div class="flex h-screen items-center justify-center bg-background">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
{:else}
    {@render children()}
{/if}
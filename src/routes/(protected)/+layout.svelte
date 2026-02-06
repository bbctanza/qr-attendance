<script lang="ts">
    import { supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { devTools } from '$lib/stores/dev';
    import OnboardingModal from '$lib/components/onboarding-modal.svelte';

    let { children } = $props();
    let isLoading = $state(true);
    let showOnboarding = $state(false);
    let userEmail = $state('');
    let userId = $state('');

    onMount(() => {
        let mounted = true;

        // Set up a listener for auth changes synchronously to ensure we catch everything
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                devTools.clearMockTime();
                goto('/login');
            }
        });

        // Check the session and onboarding status
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (!mounted) return;
            if (!session) {
                goto('/login');
            } else {
                // Check if user needs onboarding
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('onboarding_completed, email, id')
                    .eq('id', session.user.id)
                    .single();

                if (!error && profile) {
                    // If onboarding_completed is null or false, show onboarding
                    if (!profile.onboarding_completed) {
                        showOnboarding = true;
                        userEmail = profile.email || session.user.email || '';
                        userId = profile.id;
                    }
                }
                
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
    <OnboardingModal bind:open={showOnboarding} {userEmail} {userId} />
    {@render children()}
{/if}
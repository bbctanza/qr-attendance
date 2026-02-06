<script lang="ts">
    import { supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { devTools } from '$lib/stores/dev';
    import { onboardingState } from '$lib/stores/onboarding';
    import OnboardingModal from '$lib/components/onboarding-modal.svelte';
    import { AutomationEngine } from '$lib/logic/automation';

    let { children } = $props();
    let isLoading = $state(true);

    onMount(() => {
        let mounted = true;

        // Start automation engine
        const engine = new AutomationEngine();
        engine.start();

        // Set up a listener for auth changes synchronously to ensure we catch everything
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                devTools.clearMockTime();
                onboardingState.set({ isOpen: false, userEmail: '', userId: '' });
                engine.stop();
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
                        onboardingState.set({
                            isOpen: true,
                            userEmail: profile.email || session.user.email || '',
                            userId: profile.id
                        });
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
            engine.stop();
        };
    });
</script>

{#if isLoading}
    <div class="flex h-screen items-center justify-center bg-background">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
{:else}
    <OnboardingModal bind:isOpen={$onboardingState.isOpen} userEmail={$onboardingState.userEmail} userId={$onboardingState.userId} />
    {@render children()}
{/if}
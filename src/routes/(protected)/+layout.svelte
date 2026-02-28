<script lang="ts">
    import { supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { devTools } from '$lib/stores/dev';
    import { onboardingState } from '$lib/stores/onboarding';
    import OnboardingModal from '$lib/components/onboarding-modal.svelte';
    import ChangelogModal from '$lib/components/changelog-modal.svelte';
    import { automation } from '$lib/logic/automation';
    import { changelogStore } from '$lib/stores/changelog';
    import { CURRENT_VERSION, changelog } from '$lib/config/changelog';

    let { children } = $props();
    let isLoading = $state(true);
    let isChangelogOpen = $state(false);

    onMount(() => {
        let mounted = true;

        // Check for new version and show changelog if needed
        const shouldShow = changelogStore.checkAndShowChangelog(CURRENT_VERSION);
        if (shouldShow && changelog.length > 0) {
            isChangelogOpen = true;
        }

        // Start automation engine (singleton - shared across all user sessions)
        automation.start();

        // Set up a listener for auth changes synchronously to ensure we catch everything
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                devTools.clearMockTime();
                onboardingState.set({ isOpen: false, userEmail: '', userId: '' });
                // Don't stop the automation engine - it's shared across sessions
                goto('/');
            }
        });

        // Check the session and onboarding status
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (!mounted) return;
            if (!session) {
                goto('/');
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
            goto('/');
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
            // Don't stop the automation engine - it's shared across all sessions
        };
    });
</script>

{#if isLoading}
    <div class="flex h-screen items-center justify-center bg-background">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
{:else}
    <OnboardingModal bind:isOpen={$onboardingState.isOpen} userEmail={$onboardingState.userEmail} userId={$onboardingState.userId} />
    <ChangelogModal bind:open={isChangelogOpen} />
    {@render children()}
{/if}
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

    // Debug effect
    $effect(() => {
        console.log('🎬 Layout State Changed:');
        console.log('  - isLoading:', isLoading);
        console.log('  - showOnboarding:', showOnboarding);
        console.log('  - userEmail:', userEmail);
        console.log('  - userId:', userId);
    });

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
                console.log('🔍 Checking onboarding status for user:', session.user.id);
                
                // Check if user needs onboarding
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('onboarding_completed, email, id, full_name')
                    .eq('id', session.user.id)
                    .single();

                console.log('📊 Profile data:', profile);
                console.log('❌ Profile error:', error);

                if (error) {
                    console.error('Error fetching profile:', error);
                    isLoading = false;
                    return;
                }

                if (profile) {
                    console.log('✅ Onboarding completed status:', profile.onboarding_completed);
                    
                    // If onboarding_completed is null or false, show onboarding
                    if (profile.onboarding_completed !== true) {
                        console.log('🚀 Showing onboarding modal');
                        showOnboarding = true;
                        userEmail = profile.email || session.user.email || '';
                        userId = profile.id;
                    } else {
                        console.log('✓ User has completed onboarding');
                    }
                }
                
                isLoading = false;
            }
        }).catch((e) => {
            console.error('Exception during session check:', e);
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
{:else if showOnboarding}
    <!-- User needs to complete onboarding - block everything -->
    <div class="fixed inset-0 z-[100] bg-background">
        <OnboardingModal {userEmail} {userId} />
    </div>
{:else}
    <!-- User has completed onboarding - show app -->
    {@render children()}
{/if}
{/if}
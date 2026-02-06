<script lang="ts">
    import { Upload, Loader2, Eye, EyeOff } from '@lucide/svelte';
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { supabase } from '$lib/supabase';
    import { toast } from 'svelte-sonner';

    interface Props {
        userEmail: string;
        userId: string;
        isOpen: boolean;
    }

    let { userEmail, userId, isOpen = $bindable() }: Props = $props();

    let username = $state('');
    let password = $state('');
    let confirmPassword = $state('');
    let avatarFile: File | null = $state(null);
    let avatarPreview = $state('');
    let isSubmitting = $state(false);
    let showPassword = $state(false);
    let showConfirmPassword = $state(false);
    let errors = $state({
        username: '',
        password: '',
        confirmPassword: ''
    });

    function handleAvatarChange(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        
        if (file) {
            // Check file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                toast.error('File size must be less than 5MB');
                return;
            }

            // Check file type
            if (!file.type.startsWith('image/')) {
                toast.error('Please upload an image file');
                return;
            }

            avatarFile = file;
            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                avatarPreview = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    }

    function validateForm(): boolean {
        errors = { username: '', password: '', confirmPassword: '' };
        let isValid = true;

        // Validate username
        if (!username.trim()) {
            errors.username = 'Username is required';
            isValid = false;
        } else if (username.length < 3) {
            errors.username = 'Username must be at least 3 characters';
            isValid = false;
        }

        // Validate password
        if (!password) {
            errors.password = 'Password is required';
            isValid = false;
        } else if (password.length < 6) {
            errors.password = 'Password must be at least 6 characters';
            isValid = false;
        }

        // Validate confirm password
        if (!confirmPassword) {
            errors.confirmPassword = 'Please confirm your password';
            isValid = false;
        } else if (password !== confirmPassword) {
            errors.confirmPassword = 'Passwords do not match';
            isValid = false;
        }

        return isValid;
    }

    async function handleSubmit() {
        if (!validateForm()) {
            return;
        }

        isSubmitting = true;

        try {
            let avatarUrl = '';

            // Upload avatar if provided (optional - silently skip if it fails)
            if (avatarFile) {
                try {
                    const timestamp = Date.now();
                    const extension = avatarFile.name.split('.').pop();
                    const fileName = `avatar-${userId}-${timestamp}.${extension}`;

                    const { data, error: uploadError } = await supabase.storage
                        .from('user-profile')
                        .upload(fileName, avatarFile, {
                            cacheControl: '3600',
                            upsert: true
                        });

                    if (!uploadError && data) {
                        // Get signed URL (valid for 1 hour)
                        const { data: urlData } = await supabase.storage
                            .from('user-profile')
                            .createSignedUrl(fileName, 3600);

                        if (urlData?.signedUrl) {
                            avatarUrl = urlData.signedUrl;
                        }
                    }
                    // Silently ignore avatar upload errors - it's optional
                } catch (avatarError) {
                    console.warn('Avatar upload skipped:', avatarError);
                    // Continue without avatar - it's optional
                }
            }

            // Update user password
            const { error: passwordError } = await supabase.auth.updateUser({
                password: password
            });

            if (passwordError) {
                console.error('Error updating password:', passwordError);
                toast.error('Failed to set password: ' + passwordError.message);
                isSubmitting = false;
                return;
            }

            // Update profile
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: username,
                    avatar_url: avatarUrl || null,
                    onboarding_completed: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (profileError) {
                console.error('Error updating profile:', profileError);
                toast.error('Failed to update profile');
                isSubmitting = false;
                return;
            }

            toast.success('Profile setup complete! Welcome aboard!');
            isOpen = false;

            // Reload the page to refresh the user data
            setTimeout(() => {
                window.location.reload();
            }, 500);

        } catch (error) {
            console.error('Unexpected error during onboarding:', error);
            toast.error('An unexpected error occurred');
        } finally {
            isSubmitting = false;
        }
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <!-- Modal Container -->
        <div class="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
            <!-- Modal Header -->
            <div class="border-b border-border/40 p-6 sm:p-8 shrink-0">
                <h2 class="text-2xl font-bold">Welcome! Complete Your Profile</h2>
                <p class="text-sm text-muted-foreground mt-2">
                    Please complete your profile to get started. This is a one-time setup.
                </p>
            </div>

            <!-- Modal Content - Scrollable -->
            <div class="overflow-y-auto flex-1 p-6 sm:p-8">
                <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
                    <!-- Avatar Upload -->
                    <div class="flex flex-col items-center gap-4">
                        <Avatar class="h-24 w-24">
                            {#if avatarPreview}
                                <AvatarImage src={avatarPreview} alt="Profile preview" />
                            {:else}
                                <AvatarFallback class="text-2xl">
                                    {username ? username.charAt(0).toUpperCase() : '?'}
                                </AvatarFallback>
                            {/if}
                        </Avatar>
                        <div class="flex flex-col items-center gap-2">
                            <Label for="avatar" class="cursor-pointer">
                                <div class="flex items-center gap-2 text-sm text-primary hover:underline">
                                    <Upload class="h-4 w-4" />
                                    Upload Profile Picture (Optional)
                                </div>
                            </Label>
                            <Input
                                id="avatar"
                                type="file"
                                accept="image/*"
                                class="hidden"
                                onchange={handleAvatarChange}
                            />
                            <p class="text-xs text-muted-foreground">Max 5MB, JPG, PNG, or GIF</p>
                        </div>
                    </div>

                    <!-- Email (Read-only confirmation) -->
                    <div class="space-y-2">
                        <Label for="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={userEmail}
                            disabled
                            class="bg-muted"
                        />
                        <p class="text-xs text-muted-foreground">This is your account email and cannot be changed</p>
                    </div>

                    <!-- Username -->
                    <div class="space-y-2">
                        <Label for="username">Full Name / Username <span class="text-destructive">*</span></Label>
                        <Input
                            id="username"
                            type="text"
                            bind:value={username}
                            placeholder="Enter your full name"
                            required
                            class={errors.username ? 'border-destructive' : ''}
                        />
                        {#if errors.username}
                            <p class="text-sm text-destructive">{errors.username}</p>
                        {/if}
                    </div>

                    <!-- Password -->
                    <div class="space-y-2">
                        <Label for="password">Password <span class="text-destructive">*</span></Label>
                        <div class="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                bind:value={password}
                                placeholder="Create a password"
                                required
                                class={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                            />
                            <button
                                type="button"
                                onclick={() => showPassword = !showPassword}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {#if showPassword}
                                    <EyeOff class="h-4 w-4" />
                                {:else}
                                    <Eye class="h-4 w-4" />
                                {/if}
                            </button>
                        </div>
                        {#if errors.password}
                            <p class="text-sm text-destructive">{errors.password}</p>
                        {:else}
                            <p class="text-xs text-muted-foreground">Minimum 6 characters</p>
                        {/if}
                    </div>

                    <!-- Confirm Password -->
                    <div class="space-y-2">
                        <Label for="confirmPassword">Confirm Password <span class="text-destructive">*</span></Label>
                        <div class="relative">
                            <Input
                                id="confirmPassword"
                                type={showConfirmPassword ? 'text' : 'password'}
                                bind:value={confirmPassword}
                                placeholder="Re-enter your password"
                                required
                                class={errors.confirmPassword ? 'border-destructive pr-10' : 'pr-10'}
                            />
                            <button
                                type="button"
                                onclick={() => showConfirmPassword = !showConfirmPassword}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                            >
                                {#if showConfirmPassword}
                                    <EyeOff class="h-4 w-4" />
                                {:else}
                                    <Eye class="h-4 w-4" />
                                {/if}
                            </button>
                        </div>
                        {#if errors.confirmPassword}
                            <p class="text-sm text-destructive">{errors.confirmPassword}</p>
                        {/if}
                    </div>

                    <!-- Submit Button -->
                    <Button type="submit" class="w-full" disabled={isSubmitting}>
                        {#if isSubmitting}
                            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                            Setting up your profile...
                        {:else}
                            Complete Setup
                        {/if}
                    </Button>
                </form>
            </div>
        </div>
    </div>
{/if}

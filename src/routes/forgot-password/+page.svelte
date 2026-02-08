<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { QrCode, Mail, Loader2, ArrowLeft } from '@lucide/svelte';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';
	import { Turnstile } from 'svelte-turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import * as Dialog from '$lib/components/ui/dialog';

	// State
	let email = $state('');
	let isLoading = $state(false);
	let message = $state('');
	let isError = $state(false);
	let showTurnstileModal = $state(false);

	async function startResetPassword() {
		if (!email) {
			message = 'Please enter your email address.';
			isError = true;
			return;
		}
		// Open modal to trigger Turnstile
		showTurnstileModal = true;
	}

	async function handleTurnstileCallback(token: string) {
		showTurnstileModal = false;
		isLoading = true;
		message = '';
		isError = false;

		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${window.location.origin}/update-password`,
				options: {
					captchaToken: token
				}
			});

			if (error) {
				message = error.message;
				isError = true;
			} else {
				message = 'Check your email for the password reset link.';
				isError = false;
			}
		} catch (e) {
			message = 'An unexpected error occurred.';
			isError = true;
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	async function handleResetPassword() {
		startResetPassword();
	}

	onMount(() => {
		// Force light mode on forgot password page
		document.documentElement.classList.remove('dark');
	});

</script>

<div 
	class="flex min-h-screen flex-col items-center justify-center p-4 text-foreground font-sans relative light"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; background-attachment: fixed; --background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --secondary: oklch(0.968 0.007 247.896); --secondary-foreground: oklch(0.208 0.042 265.755); --muted-foreground: oklch(0.554 0.046 257.417); --input: oklch(0.929 0.013 255.508);"
>
	<!-- Overlay for better readability -->
	<div class="absolute inset-0 bg-white/60"></div>
	
	<!-- Content container -->
	<div class="relative z-10">
	<div class="flex w-full max-w-100 flex-col items-center space-y-6">
		
		<!-- Logo Section -->
		<div class="flex flex-col items-center space-y-2 text-center">
			<div class="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border text-primary shadow-2xl shadow-primary/20">
				<QrCode class="h-8 w-8" />
			</div>
			<div class="space-y-1">
				<h1 class="text-2xl font-bold tracking-tight text-foreground">
					Reset password
				</h1>
				<p class="text-sm text-muted-foreground">
					Enter your email and we'll send you a link to reset your password.
				</p>
			</div>
		</div>

		<!-- Reset Card -->
		<div class="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
			
			{#if message}
				<div class={`mb-4 rounded-md p-3 text-sm border ${isError ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
					{message}
				</div>
			{/if}

			<div class="grid gap-6">
				<div class="grid gap-2">
					<Label for="email" class="text-foreground">Email address</Label>
					<div class="relative">
						<div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
							<Mail class="h-5 w-5" />
						</div>
						<Input
							id="email"
							type="email"
							placeholder="you@example.com"
							bind:value={email}
							disabled={isLoading}
							class="pl-10 bg-secondary/50 border-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:ring-offset-0"
						onkeydown={(e) => e.key === 'Enter' && startResetPassword()}
						/>
					</div>
				</div>

				<Button 
					class="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium" 
					onclick={startResetPassword} 
					disabled={isLoading}
				>
					{#if isLoading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Sending bond...
					{:else}
						Send recovery link
					{/if}
				</Button>

                <div class="text-center">
                    <a href="/" class="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90 transition-colors">
                        <ArrowLeft class="mr-1 h-4 w-4" />
                        Back to login
                    </a>
                </div>
			</div>

		</div>
	</div>
	</div>
	<!-- End content container -->
</div>

<Dialog.Root bind:open={showTurnstileModal}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm pointer-events-none" style="--background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695);" />
		<Dialog.Content class="fixed left-[50%] top-[50%] z-50 grid w-[95vw] max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-4 sm:p-6 shadow-lg duration-200 rounded-xl max-h-[90vh] overflow-y-auto pointer-events-auto" style="--background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --muted-foreground: oklch(0.554 0.046 257.417);">
			<Dialog.Header>
				<Dialog.Title class="text-lg sm:text-xl font-semibold">Security Verification</Dialog.Title>
				<Dialog.Description class="text-xs sm:text-sm text-muted-foreground">
					Please complete the captcha to securely reset your password.
				</Dialog.Description>
			</Dialog.Header>
			<div class="flex items-center justify-center p-2 sm:p-4 min-h-32 overflow-x-auto">
				<Turnstile 
					siteKey={PUBLIC_TURNSTILE_SITE_KEY} 
					on:turnstile-callback={(e) => handleTurnstileCallback(e.detail.token)} 
				/>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

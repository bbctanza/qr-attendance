<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { QrCode, Eye, EyeOff, Loader2, Mail, Lock } from '@lucide/svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Turnstile } from 'svelte-turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import * as Dialog from '$lib/components/ui/dialog';
	import { createSession, setCurrentSessionId } from '$lib/utils/sessions';

	// State
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isLoading = $state(false);
	let isVerifying = $state(false);
	let errorMessage = $state('');
	let rememberMe = $state(false);
	let showTurnstileModal = $state(false);

	async function startLogin() {
		errorMessage = '';
		if (!email || !password) {
			errorMessage = 'Please enter both email and password.';
			return;
		}
		
		// Open modal to trigger Turnstile
		showTurnstileModal = true;
	}

	async function handleTurnstileCallback(token: string) {
		showTurnstileModal = false;
		isLoading = true;
		
		try {
			const { error } = await supabase.auth.signInWithPassword({
				email,
				password,
				options: {
					captchaToken: token
				}
			});

			if (error) {
				errorMessage = error.message;
			} else {
				// Login successful - create session
				const session = await createSession();
				if (session) {
					// Store the session ID for activity tracking
					setCurrentSessionId(session.id);
					console.log('Session created:', session.id, 'Last active:', session.last_active);
				} else {
					console.warn('Failed to create session');
				}
				goto('/overview');
			}
		} catch (e) {
			errorMessage = 'An unexpected error occurred.';
		} finally {
			isLoading = false;
		}
	}

	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}
</script>

<div 
	class="flex min-h-screen flex-col items-center justify-center p-4 text-foreground font-sans relative"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; background-attachment: fixed;"
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
					Welcome back
				</h1>
				<p class="text-sm text-muted-foreground">
					Please sign in to your {siteConfig.name} account
				</p>
			</div>
		</div>

		<!-- Login Card -->
		<div class="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
			
			{#if errorMessage}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
					{errorMessage}
				</div>
			{/if}

			<div class="grid gap-4">
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
						/>
					</div>
				</div>

				<div class="grid gap-2">
					<Label for="password" class="text-foreground">Password</Label>
					<div class="relative">
						<div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
							<Lock class="h-5 w-5" />
						</div>
						<Input
							id="password"
							type={showPassword ? 'text' : 'password'}
							placeholder="••••••••"
							bind:value={password}
							disabled={isLoading}
							class="pl-10 pr-10 bg-secondary/50 border-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:ring-offset-0"
						/>
						<div class="absolute inset-y-0 right-0 flex items-center pr-3">
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground focus:outline-hidden transition-colors"
								onclick={togglePasswordVisibility}
								aria-label={showPassword ? "Hide password" : "Show password"}
							>
								{#if showPassword}
									<EyeOff class="h-4 w-4" />
								{:else}
									<Eye class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>
				</div>

				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-2">
						<Checkbox 
							id="remember" 
							bind:checked={rememberMe} 
							class="border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
						/>
						<Label
							for="remember"
							class="text-sm font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Remember me
						</Label>
					</div>
					<a href="/forgot-password" class="text-sm font-medium text-primary hover:text-primary/90 hover:underline">
						Forgot your password?
					</a>
				</div>

				<Button 
					class="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium" 
					onclick={startLogin} 
					disabled={isLoading}
				>
					{#if isLoading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Signing in...
					{:else}
						Sign in
					{/if}
				</Button>
			</div>

		</div>

		<!-- Footer outside the card -->
		<div class="flex flex-col items-center space-y-1 text-center text-muted-foreground">
			<p class="text-xs font-medium">Bible Baptist Church Tanza © 2026</p>
			<p class="text-[10px] italic">"1 Corinthians 14:40 Let all things be done decently and in order."</p>
		</div>
	</div>
	</div>
	<!-- End content container -->
</div>

<Dialog.Root bind:open={showTurnstileModal}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm pointer-events-none" />
		<Dialog.Content class="fixed left-[50%] top-[50%] z-50 grid w-[95vw] max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-4 sm:p-6 shadow-lg duration-200 rounded-xl max-h-[90vh] overflow-y-auto pointer-events-auto">
			<Dialog.Header>
				<Dialog.Title class="text-lg sm:text-xl font-semibold">Security Verification</Dialog.Title>
				<Dialog.Description class="text-xs sm:text-sm text-muted-foreground">
					Please complete the captcha to securely sign in to your account.
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

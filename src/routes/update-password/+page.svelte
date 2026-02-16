<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { QrCode, Lock, Eye, EyeOff, Loader2, ArrowLeft } from '@lucide/svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// State
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let isLoading = $state(false);
	let message = $state('');
	let isError = $state(false);
	let tokenValid = $state(false);
	let isCheckingToken = $state(true);

	async function checkToken() {
		try {
			const session = await supabase.auth.getSession();
			if (session.data.session) {
				tokenValid = true;
			} else {
				message = 'Invalid or expired reset link. Please request a new one.';
				isError = true;
			}
		} catch (e) {
			message = 'Error validating reset link.';
			isError = true;
			console.error(e);
		} finally {
			isCheckingToken = false;
		}
	}

	async function handleResetPassword() {
		// Validation
		if (!password || !confirmPassword) {
			message = 'Please enter your new password.';
			isError = true;
			return;
		}

		if (password.length < 6) {
			message = 'Password must be at least 6 characters.';
			isError = true;
			return;
		}

		if (password !== confirmPassword) {
			message = 'Passwords do not match.';
			isError = true;
			return;
		}

		isLoading = true;
		message = '';
		isError = false;

		try {
			const { error } = await supabase.auth.updateUser({
				password: password
			});

			if (error) {
				message = error.message;
				isError = true;
			} else {
				message = 'Password reset successfully! Redirecting to login...';
				isError = false;
				// Redirect to login after 2 seconds
				setTimeout(() => {
					goto('/');
				}, 2000);
			}
		} catch (e) {
			message = 'An unexpected error occurred.';
			isError = true;
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}

	function toggleConfirmPasswordVisibility() {
		showConfirmPassword = !showConfirmPassword;
	}

	onMount(() => {
		// Force light mode on reset password page
		document.documentElement.classList.remove('dark');
		// Check if we have a valid token
		checkToken();
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
						Reset your password
					</h1>
					<p class="text-sm text-muted-foreground">
						Enter your new password below.
					</p>
				</div>
			</div>

			{#if isCheckingToken}
				<!-- Loading state -->
				<div class="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-center justify-center py-8">
						<Loader2 class="h-6 w-6 animate-spin text-primary" />
					</div>
				</div>
			{:else if !tokenValid}
				<!-- Invalid token state -->
				<div class="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
					{#if message}
						<div class={`rounded-md p-3 text-sm border bg-destructive/10 text-destructive border-destructive/20 mb-4`}>
							{message}
						</div>
					{/if}
					<div class="text-center">
						<a href="/forgot-password" class="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90 transition-colors">
							<ArrowLeft class="mr-1 h-4 w-4" />
							Request new reset link
						</a>
					</div>
				</div>
			{:else}
				<!-- Reset Password Form -->
				<div class="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
					
					{#if message}
						<div class={`mb-4 rounded-md p-3 text-sm border ${isError ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
							{message}
						</div>
					{/if}

					<div class="grid gap-6">
						<div class="grid gap-2">
							<Label for="password" class="text-foreground">New password</Label>
							<div class="relative">
								<div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
									<Lock class="h-5 w-5" />
								</div>
								<Input
									id="password"
									type={showPassword ? 'text' : 'password'}
									placeholder="Enter your new password"
									bind:value={password}
									disabled={isLoading}
									class="pl-10 pr-10 bg-secondary/50 border-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:ring-offset-0"
								/>
								<button
									type="button"
									on:click={togglePasswordVisibility}
									class="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
									disabled={isLoading}
								>
									{#if showPassword}
										<EyeOff class="h-5 w-5" />
									{:else}
										<Eye class="h-5 w-5" />
									{/if}
								</button>
							</div>
							<p class="text-xs text-muted-foreground">
								Password must be at least 6 characters.
							</p>
						</div>

						<div class="grid gap-2">
							<Label for="confirm-password" class="text-foreground">Confirm password</Label>
							<div class="relative">
								<div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
									<Lock class="h-5 w-5" />
								</div>
								<Input
									id="confirm-password"
									type={showConfirmPassword ? 'text' : 'password'}
									placeholder="Confirm your new password"
									bind:value={confirmPassword}
									disabled={isLoading}
									class="pl-10 pr-10 bg-secondary/50 border-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:ring-offset-0"
									onkeydown={(e) => e.key === 'Enter' && handleResetPassword()}
								/>
								<button
									type="button"
									on:click={toggleConfirmPasswordVisibility}
									class="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
									disabled={isLoading}
								>
									{#if showConfirmPassword}
										<EyeOff class="h-5 w-5" />
									{:else}
										<Eye class="h-5 w-5" />
									{/if}
								</button>
							</div>
						</div>

						<Button 
							class="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium" 
							onclick={handleResetPassword} 
							disabled={isLoading}
						>
							{#if isLoading}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								Resetting password...
							{:else}
								Reset password
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
			{/if}
		</div>
	</div>
	<!-- End content container -->
</div>

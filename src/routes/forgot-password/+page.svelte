<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { QrCode, Mail, Loader2, ArrowLeft } from '@lucide/svelte';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';

	// State
	let email = $state('');
	let isLoading = $state(false);
	let message = $state('');
	let isError = $state(false);

	async function handleResetPassword() {
		isLoading = true;
		message = '';
		isError = false;

		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${window.location.origin}/update-password`
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

	onMount(() => {
		// Force light mode on forgot password page
		document.documentElement.classList.remove('dark');
	});

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
						/>
					</div>
				</div>

				<Button 
					class="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium" 
					onclick={handleResetPassword} 
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

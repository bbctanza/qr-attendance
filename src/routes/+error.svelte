<script lang="ts">
	import { page } from '$app/stores';
	import { AlertCircle } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let countdown = $state(3);
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
		const timer = setInterval(() => {
			countdown--;
			if (countdown <= 0) {
				clearInterval(timer);
				// Try to go back in history
				if (window.history.length > 1) {
					history.back();
				} else {
					// If no history, go to dashboard
					goto('/overview');
				}
			}
		}, 1000);

		return () => clearInterval(timer);
	});
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
	<div class="flex w-full max-w-md flex-col items-center space-y-6 text-center">
		<!-- Error Icon -->
		<div class="rounded-full bg-destructive/10 p-6">
			<AlertCircle class="h-12 w-12 text-destructive" />
		</div>

		<!-- Error Code -->
		<div class="space-y-2">
			<h1 class="text-5xl font-bold tracking-tight">{$page.status}</h1>
			<p class="text-xl font-semibold text-muted-foreground">
				{$page.status === 404 ? 'Page Not Found' : 'Error'}
			</p>
		</div>

		<!-- Error Message -->
		<div class="space-y-2">
			<p class="text-sm text-muted-foreground">
				{$page.error?.message ||
					($page.status === 404
						? "Sorry, the page you're looking for doesn't exist or has been moved."
						: 'An unexpected error occurred. Please try again.')}
			</p>
		</div>

		<!-- Countdown Message -->
		{#if mounted}
			<div class="space-y-4 w-full">
				<p class="text-sm text-muted-foreground">
					Redirecting in <span class="font-bold text-primary">{countdown}</span> second{countdown !== 1 ? 's' : ''}...
				</p>
				<div class="h-1 w-full overflow-hidden rounded-full bg-secondary">
					<div
						class="h-full bg-primary transition-all duration-1000"
						style="width: {(countdown / 3) * 100}%"
					></div>
				</div>
			</div>
		{:else}
			<div class="space-y-4 w-full">
				<p class="text-sm text-muted-foreground">
					Preparing to redirect...
				</p>
				<div class="h-1 w-full overflow-hidden rounded-full bg-secondary">
					<div class="h-full bg-primary animate-pulse"></div>
				</div>
			</div>
		{/if}

		<!-- Additional Info -->
		{#if $page.status === 404}
			<div class="rounded-lg border border-border bg-card/50 p-4">
				<p class="text-xs text-muted-foreground">
					Requested path: <span class="font-mono text-foreground">{$page.url.pathname}</span>
				</p>
			</div>
		{/if}
	</div>
</div>

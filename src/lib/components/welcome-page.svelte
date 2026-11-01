<script lang="ts">
	import { siteConfig } from '$lib/config/site';

	/**
	 * Public landing page, and the loading screen during the initial auth check.
	 *
	 * This used to be loading-only: `/` rendered a spinner and immediately JS-redirected to the
	 * login form, so the only thing a crawler ever saw on this domain was a password prompt with
	 * no organisation behind it. That shape is indistinguishable from a phishing kit and is a
	 * large part of why Safe Browsing flagged the site.
	 *
	 * With `isLoading = false` this renders actual content instead: who runs the system, what it
	 * is for, how to make contact, and an explicit route to the staff sign-in.
	 */
	let { isLoading = true }: { isLoading?: boolean } = $props();

	const currentYear = new Date().getFullYear();
	const org = siteConfig.organization;
	const hasContact = org.contactEmail && !org.contactEmail.startsWith('REPLACE_ME');
</script>

<div
	class="light relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden p-4 font-sans text-foreground"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; background-attachment: fixed; --background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --secondary: oklch(0.968 0.007 247.896); --secondary-foreground: oklch(0.208 0.042 265.755); --muted-foreground: oklch(0.554 0.046 257.417); --input: oklch(0.929 0.013 255.508);"
>
	<!-- Overlay for better readability -->
	<div class="absolute inset-0 bg-white/60"></div>

	<!-- Content container -->
	<div class="relative z-10 flex w-full items-center justify-center py-8">
		<div
			class="flex w-full max-w-md flex-col items-center justify-center gap-6 text-center sm:gap-8"
		>
			<!-- Logo -->
			<div class="mb-2 flex items-center justify-center">
				<img
					src="/favicon.svg"
					alt="{org.name} attendance system logo"
					class="h-16 w-16 sm:h-20 sm:w-20"
				/>
			</div>

			<!-- Organization Name -->
			<div class="space-y-3">
				<p class="text-sm font-medium text-muted-foreground sm:text-base">
					{org.name}
				</p>
				<h1 class="text-3xl leading-tight font-bold text-foreground sm:text-4xl md:text-5xl">
					QR Attendance
				</h1>
			</div>

			{#if isLoading}
				<!-- Brief auth check only -->
				<div class="flex justify-center gap-2 py-6 sm:py-8">
					<div
						class="h-2.5 w-2.5 animate-bounce rounded-full bg-primary sm:h-3 sm:w-3"
						style="animation-delay: 0s;"
					></div>
					<div
						class="h-2.5 w-2.5 animate-bounce rounded-full bg-primary sm:h-3 sm:w-3"
						style="animation-delay: 0.1s;"
					></div>
					<div
						class="h-2.5 w-2.5 animate-bounce rounded-full bg-primary sm:h-3 sm:w-3"
						style="animation-delay: 0.2s;"
					></div>
				</div>
			{:else}
				<!-- Plain-language description of what this site is. Rendered server-side, so it is
				     present even with JavaScript disabled - which is how a crawler sees the page. -->
				<p class="px-2 text-sm leading-relaxed text-muted-foreground">
					{org.purpose}
				</p>

				<div class="flex w-full flex-col items-center gap-3">
					<a
						href="/login"
						class="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
					>
						Staff sign in
					</a>

					{#if hasContact}
						<p class="text-xs text-muted-foreground">
							Questions about this site?
							<a href="mailto:{org.contactEmail}" class="font-medium text-primary underline">
								{org.contactEmail}
							</a>
						</p>
					{/if}
				</div>
			{/if}

			<!-- Verse -->
			<div class="pt-4 text-center sm:pt-6">
				<p class="px-2 text-xs leading-relaxed text-muted-foreground italic sm:text-sm">
					"{org.tagline}"
				</p>
			</div>

			<!-- Footer / Copyright -->
			<div class="mt-4 w-full border-t border-border pt-6 text-center sm:pt-8">
				<p class="text-xs font-medium text-muted-foreground">
					{org.name} © {currentYear}
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	:global(.animate-bounce) {
		animation: bounce 1.4s infinite;
	}

	@keyframes bounce {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.7;
		}
		50% {
			transform: translateY(-10px);
			opacity: 1;
		}
	}
</style>

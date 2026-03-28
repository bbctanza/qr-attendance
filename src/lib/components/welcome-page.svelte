<script lang="ts">
	let { isLoading = true } = $props();
	const currentYear = new Date().getFullYear();
</script>

<div
	class="light relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden p-4 font-sans text-foreground"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; background-attachment: fixed; --background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --secondary: oklch(0.968 0.007 247.896); --secondary-foreground: oklch(0.208 0.042 265.755); --muted-foreground: oklch(0.554 0.046 257.417); --input: oklch(0.929 0.013 255.508);"
>
	<!-- Overlay for better readability -->
	<div class="absolute inset-0 bg-white/60"></div>

	<!-- Content container -->
	<div class="relative z-10 flex w-full items-center justify-center">
		<div
			class="flex w-full max-w-md flex-col items-center justify-center gap-6 text-center sm:gap-8"
		>
			<!-- Logo -->
			<div class="mb-2 flex items-center justify-center">
				<img src="/favicon.svg" alt="QR Attendance Logo" class="h-16 w-16 sm:h-20 sm:w-20" />
			</div>

			<!-- Organization Name -->
			<div class="space-y-3">
				<p class="text-sm font-medium text-muted-foreground sm:text-base">
					Bible Baptist Church Tanza
				</p>
				<h1 class="text-3xl leading-tight font-bold text-foreground sm:text-4xl md:text-5xl">
					QR Attendance
				</h1>
			</div>

			<!-- Loading Indicator -->
			{#if isLoading}
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
			{/if}

			<!-- Verse -->
			<div class="pt-4 text-center sm:pt-6">
				<p class="px-2 text-xs leading-relaxed text-muted-foreground italic sm:text-sm">
					"John 12:32 A Place Where Christ is Lifted Up"
				</p>
			</div>

			<!-- Footer / Copyright -->
			<div class="mt-4 w-full border-t border-border pt-6 text-center sm:pt-8">
				<p class="text-xs font-medium text-muted-foreground">
					Bible Baptist Church Tanza © {currentYear}
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

<script lang="ts">
	let { isLoading = true } = $props();
	const currentYear = new Date().getFullYear();
</script>

<div 
	class="flex h-screen w-screen flex-col items-center justify-center overflow-hidden p-4 text-foreground font-sans relative light"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; background-attachment: fixed; --background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --secondary: oklch(0.968 0.007 247.896); --secondary-foreground: oklch(0.208 0.042 265.755); --muted-foreground: oklch(0.554 0.046 257.417); --input: oklch(0.929 0.013 255.508);"
>
	<!-- Overlay for better readability -->
	<div class="absolute inset-0 bg-white/60"></div>
	
	<!-- Content container -->
	<div class="relative z-10 flex items-center justify-center w-full">
		<div class="flex flex-col items-center justify-center gap-6 sm:gap-8 max-w-md w-full text-center">
			
			<!-- Logo -->
			<div class="flex items-center justify-center mb-2">
				<img src="/favicon.svg" alt="QR Attendance Logo" class="w-16 h-16 sm:w-20 sm:h-20" />
			</div>

			<!-- Organization Name -->
			<div class="space-y-3">
				<p class="text-sm sm:text-base font-medium text-muted-foreground">
					Bible Baptist Church Tanza
				</p>
				<h1 class="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground leading-tight">
					QR Attendance
				</h1>
			</div>

			<!-- Loading Indicator -->
			{#if isLoading}
				<div class="flex gap-2 justify-center py-6 sm:py-8">
					<div class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-primary animate-bounce" style="animation-delay: 0s;"></div>
					<div class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-primary animate-bounce" style="animation-delay: 0.1s;"></div>
					<div class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-primary animate-bounce" style="animation-delay: 0.2s;"></div>
				</div>
			{/if}

			<!-- Verse -->
			<div class="text-center pt-4 sm:pt-6">
				<p class="text-xs sm:text-sm italic text-muted-foreground leading-relaxed px-2">
					"John 12:32 A Place Where Christ is Lifted Up"
				</p>
			</div>

			<!-- Footer / Copyright -->
			<div class="text-center pt-6 sm:pt-8 border-t border-border w-full mt-4">
				<p class="text-xs text-muted-foreground font-medium">
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
		0%, 100% {
			transform: translateY(0);
			opacity: 0.7;
		}
		50% {
			transform: translateY(-10px);
			opacity: 1;
		}
	}
</style>

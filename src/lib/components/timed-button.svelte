<script lang="ts">
	interface Props {
		label: string;
		onClick: () => void;
		variant?: 'success' | 'error';
		duration?: number;
		onExpire?: () => void;
	}

	let { label, onClick, variant = 'success', duration = 5000, onExpire } = $props();

	let progress = $state(100);
	let interval: any = null;

	$effect(() => {
		if (interval) clearInterval(interval);
		progress = 100;
		const step = 100 / (duration / 50);
		interval = setInterval(() => {
			progress -= step;
			if (progress <= 0) {
				clearInterval(interval);
				onExpire?.();
			}
		}, 50);

		return () => {
			if (interval) clearInterval(interval);
		};
	});

	function handleClick() {
		clearInterval(interval);
		onClick();
	}

	const colorMap = {
		success: {
			bg: 'bg-green-600 hover:bg-green-700',
			progress: 'bg-gradient-to-r from-green-500 to-green-400',
			shadow: 'shadow-green-500/20'
		},
		error: {
			bg: 'bg-red-600 hover:bg-red-700',
			progress: 'bg-gradient-to-r from-red-500 to-red-400',
			shadow: 'shadow-red-500/20'
		}
	};

	const colors = $derived(colorMap[variant as keyof typeof colorMap]);
</script>

<button
	onclick={handleClick}
	class="relative w-full py-6 rounded-2xl {colors.bg} text-white font-bold text-lg active:scale-[0.98] transition-all shadow-lg {colors.shadow} overflow-hidden"
>
	<!-- Progress bar background fill -->
	<div
		class="absolute inset-0 {colors.progress} opacity-30 transition-all"
		style="width: {Math.max(0, progress)}%; transition: width 50ms linear;"
	></div>

	<!-- Button text (on top of progress) -->
	<div class="relative z-10 flex items-center justify-center gap-2">
		<span>{label}</span>
		<span class="text-xs font-mono bg-white/20 px-2 py-1 rounded-lg">({String(Math.ceil(progress / 20)).padStart(1, '0')}s)</span>
	</div>
</button>

<style>
</style>
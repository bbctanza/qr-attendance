<script lang="ts">
	export let value: number = 0;
	export let max: number = 100;
	export let className: string = '';

	$: percent = Math.max(0, Math.min(100, (value / max) * 100));
	$: ariaValue = Math.round(percent);
</script>

<div
	class={`w-full ${className}`}
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={max}
	aria-valuenow={ariaValue}
>
	<div class="h-3 overflow-hidden rounded-full bg-muted">
		<div class="h-full bg-primary transition-all" style={`width: ${percent}%`}></div>
	</div>
</div>

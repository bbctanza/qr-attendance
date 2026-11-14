<script lang="ts">
	import { Delete } from '@lucide/svelte';

	/**
	 * A numeric keypad, because the alternative on a kiosk is the OS on-screen keyboard: slow,
	 * covers half the screen, and on Windows may not appear at all without a touch keyboard
	 * service running. A PIN pad is also what anyone who has used a bank machine expects.
	 *
	 * Physical keys work too — staff often have a USB scanner's keyboard wedge or a real
	 * keyboard attached, and making them tap glass when they have digits under their fingers
	 * would be a small daily insult.
	 */
	let {
		value = $bindable(''),
		length,
		disabled = false,
		onsubmit
	}: {
		value?: string;
		length: number;
		disabled?: boolean;
		onsubmit?: () => void;
	} = $props();

	function press(digit: string) {
		if (disabled || value.length >= length) return;
		value += digit;
		// Submitting on the last digit saves a reach for a confirm key that has no other job.
		if (value.length === length) onsubmit?.();
	}

	function backspace() {
		if (disabled) return;
		value = value.slice(0, -1);
	}

	function onKey(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key >= '0' && event.key <= '9') {
			event.preventDefault();
			press(event.key);
		} else if (event.key === 'Backspace') {
			event.preventDefault();
			backspace();
		} else if (event.key === 'Enter' && value.length === length) {
			event.preventDefault();
			onsubmit?.();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="flex flex-col items-center gap-6">
	<!-- Filled dots, not the digits: a PIN on a screen at a door is readable from the queue. -->
	<div class="flex gap-3" role="status" aria-label="{value.length} of {length} digits entered">
		{#each Array(length) as _, i (i)}
			<span
				class="size-3.5 rounded-full border-2 transition-colors
					{i < value.length ? 'border-primary bg-primary' : 'border-muted-foreground/40'}"
			></span>
		{/each}
	</div>

	<div class="grid grid-cols-3 gap-3">
		{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit (digit)}
			<button
				type="button"
				{disabled}
				onclick={() => press(digit)}
				class="size-20 rounded-2xl border border-border bg-card text-2xl font-semibold
					tabular-nums transition-colors hover:bg-accent active:bg-accent
					focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
					disabled:opacity-40"
			>
				{digit}
			</button>
		{/each}

		<span></span>

		<button
			type="button"
			{disabled}
			onclick={() => press('0')}
			class="size-20 rounded-2xl border border-border bg-card text-2xl font-semibold
				tabular-nums transition-colors hover:bg-accent active:bg-accent
				focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
				disabled:opacity-40"
		>
			0
		</button>

		<button
			type="button"
			disabled={disabled || value.length === 0}
			onclick={backspace}
			aria-label="Delete the last digit"
			class="grid size-20 place-items-center rounded-2xl border border-border bg-card
				text-muted-foreground transition-colors hover:bg-accent active:bg-accent
				focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
				disabled:opacity-40"
		>
			<Delete class="size-7" />
		</button>
	</div>
</div>

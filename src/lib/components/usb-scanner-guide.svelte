<script lang="ts">
	import { Camera } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		/** True once a scan has come in this session (switching modes manually doesn't prove it's plugged in). */
		connected: boolean;
		/** Increments on every USB scan so the illustration can flash. */
		scanTick: number;
		lastScanned: { name: string; timestamp: string } | null;
		onUseCamera: () => void;
		compact?: boolean;
	}

	let { connected, scanTick, lastScanned, onUseCamera, compact = false }: Props = $props();

	const steps = [
		{ title: 'Open your QR code', text: 'On your phone or printed ID card' },
		{ title: 'Hold it over the glass', text: 'Face down, about 2–10 cm above' },
		{ title: 'Wait for the beep', text: 'Your name will appear on screen' }
	];
</script>

<div class="flex w-full flex-col items-center text-center {compact ? 'gap-5 p-5' : 'max-w-2xl gap-8'}">
	{#if connected}
		<div
			class="inline-flex items-center gap-2 rounded-full border border-(--stat-success)/30 bg-(--stat-success)/10 px-3 py-1 text-xs font-semibold text-(--stat-success)"
		>
			<span class="relative flex h-2 w-2">
				<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--stat-success) opacity-75"></span>
				<span class="relative inline-flex h-2 w-2 rounded-full bg-(--stat-success)"></span>
			</span>
			USB scanner connected · camera off
		</div>
	{:else}
		<div
			class="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground"
		>
			<span class="h-2 w-2 animate-pulse rounded-full bg-muted-foreground"></span>
			USB scanner mode · waiting for first scan
		</div>
	{/if}

	<!-- Illustration: QR code lowered over the scanner window, which lights up on read -->
	<div class="relative {compact ? 'w-56' : 'w-80'}">
		{#key scanTick}
			<div
				class="pointer-events-none absolute inset-x-6 bottom-2 h-1/2 rounded-full bg-(--stat-success) {scanTick > 0
					? 'scan-flash'
					: 'opacity-0'}"
			></div>
		{/key}
		<svg viewBox="0 0 240 200" class="relative w-full" role="img" aria-label="Hold your QR code over the scanner">
			<!-- Cable -->
			<path
				d="M172 126 C 196 122, 210 104, 226 92"
				fill="none"
				stroke="currentColor"
				stroke-width="5"
				stroke-linecap="round"
				class="text-foreground/70"
			/>

			<!-- Light from the scanner window -->
			<polygon points="84,116 156,116 146,88 94,88" class="beam fill-(--stat-success)" />

			<!-- Scanner body: front face, then top face -->
			<rect x="64" y="132" width="112" height="56" rx="14" class="fill-muted-foreground/40" />
			<rect x="64" y="102" width="112" height="62" rx="14" class="fill-card stroke-border" stroke-width="2" />
			<rect x="78" y="110" width="84" height="46" rx="8" class="fill-foreground/85" />
			<rect x="78" y="110" width="84" height="46" rx="8" class="window-glow fill-(--stat-success)" />
			<circle cx="120" cy="133" r="2.5" class="fill-background/70" />

			<!-- Phone showing a QR code -->
			<g class="phone">
				<rect x="92" y="10" width="56" height="78" rx="9" class="fill-foreground" />
				<rect x="96" y="16" width="48" height="66" rx="5" class="fill-background" />
				<g class="fill-foreground">
					<rect x="102" y="28" width="12" height="12" rx="1" />
					<rect x="126" y="28" width="12" height="12" rx="1" />
					<rect x="102" y="52" width="12" height="12" rx="1" />
					<rect x="118" y="44" width="5" height="5" />
					<rect x="126" y="52" width="5" height="5" />
					<rect x="133" y="58" width="5" height="5" />
					<rect x="118" y="58" width="5" height="5" />
					<rect x="126" y="44" width="5" height="5" />
				</g>
				<rect x="96" y="40" width="48" height="2" class="scan-line fill-(--stat-success)" />
			</g>

			<!-- Success check -->
			<g class="check">
				<circle cx="164" cy="22" r="13" class="fill-(--stat-success)" />
				<path
					d="M157 22 l5 5 l9 -10"
					fill="none"
					stroke="white"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</g>
		</svg>
	</div>

	<div>
		<p class="font-bold {compact ? 'text-lg' : 'text-2xl'}">Scan your QR code on the scanner</p>
		<p class="mt-1 text-muted-foreground {compact ? 'text-xs' : 'text-sm'}">
			No need to touch the screen — check-in happens automatically.
		</p>
	</div>

	<ol class="grid w-full gap-3 text-left {compact ? 'grid-cols-1' : 'grid-cols-3'}">
		{#each steps as step, i}
			<li class="flex items-start gap-3 rounded-xl border border-border/50 bg-card/50 p-3">
				<span
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
					>{i + 1}</span
				>
				<div class="min-w-0">
					<div class="text-sm font-semibold">{step.title}</div>
					<div class="mt-0.5 text-xs text-muted-foreground">{step.text}</div>
				</div>
			</li>
		{/each}
	</ol>

	<div class="flex flex-col items-center gap-3">
		{#if lastScanned}
			<p class="text-xs text-muted-foreground">
				Last check-in: <span class="font-semibold text-foreground">{lastScanned.name}</span> · {lastScanned.timestamp}
			</p>
		{/if}
		<Button variant="outline" size="sm" class="rounded-full" onclick={onUseCamera}>
			<Camera class="mr-2 h-4 w-4" /> Use camera instead
		</Button>
	</div>
</div>

<style>
	/* 3.2s loop: phone lowers → scan line sweeps → window lights → check appears → reset */
	.phone {
		animation: phone-lower 3.2s ease-in-out infinite;
	}
	.scan-line {
		animation: scan-sweep 3.2s ease-in-out infinite;
	}
	.beam {
		opacity: 0;
		animation: beam 3.2s ease-in-out infinite;
	}
	.window-glow {
		opacity: 0;
		animation: beam 3.2s ease-in-out infinite;
	}
	.check {
		opacity: 0;
		transform-origin: 164px 22px;
		animation: check-pop 3.2s ease-out infinite;
	}

	@keyframes phone-lower {
		0% {
			transform: translateY(-14px);
			opacity: 0;
		}
		15%,
		85% {
			transform: translateY(0);
			opacity: 1;
		}
		100% {
			transform: translateY(-14px);
			opacity: 0;
		}
	}
	@keyframes scan-sweep {
		0%,
		25% {
			transform: translateY(0);
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
		50% {
			transform: translateY(26px);
			opacity: 1;
		}
		55%,
		100% {
			transform: translateY(26px);
			opacity: 0;
		}
	}
	@keyframes beam {
		0%,
		25% {
			opacity: 0;
		}
		35%,
		55% {
			opacity: 0.35;
		}
		70%,
		100% {
			opacity: 0;
		}
	}
	@keyframes check-pop {
		0%,
		52% {
			opacity: 0;
			transform: scale(0.4);
		}
		60% {
			opacity: 1;
			transform: scale(1.1);
		}
		65%,
		82% {
			opacity: 1;
			transform: scale(1);
		}
		92%,
		100% {
			opacity: 0;
			transform: scale(1);
		}
	}

	/* Real scan received: one bright pulse behind the scanner */
	.scan-flash {
		filter: blur(24px);
		animation: flash 0.9s ease-out forwards;
	}
	@keyframes flash {
		0% {
			opacity: 0.7;
			transform: scale(0.9);
		}
		100% {
			opacity: 0;
			transform: scale(1.3);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.phone,
		.scan-line,
		.check,
		.scan-flash {
			animation: none;
		}
		.beam,
		.window-glow {
			animation: none;
			opacity: 0.3;
		}
		.check {
			opacity: 1;
		}
	}
</style>

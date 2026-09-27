// Browsers keep an AudioContext "suspended" unless it is created or resumed during a
// user gesture. QR scan callbacks are not user gestures, so we share one context and
// unlock it on the first tap/click/keypress on the page.
let audioContext: AudioContext | null = null;
let unlockListenersAdded = false;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioContext) {
		const Ctx = window.AudioContext || (window as any).webkitAudioContext;
		if (!Ctx) return null;
		audioContext = new Ctx();
	}
	return audioContext;
}

export function unlockAudio() {
	const ctx = getAudioContext();
	if (ctx && ctx.state !== 'running') {
		ctx.resume().catch(() => {});
	}
}

export function setupAudioUnlock() {
	if (typeof window === 'undefined' || unlockListenersAdded) return;
	unlockListenersAdded = true;

	const events = ['pointerdown', 'touchend', 'keydown'] as const;
	const handler = () => {
		unlockAudio();
		if (audioContext?.state === 'running') {
			events.forEach((e) => window.removeEventListener(e, handler, true));
		}
	};
	events.forEach((e) => window.addEventListener(e, handler, true));
}

export function playBeep(frequency = 800, duration = 200) {
	try {
		const ctx = getAudioContext();
		if (!ctx) return;
		if (ctx.state !== 'running') ctx.resume().catch(() => {});

		const oscillator = ctx.createOscillator();
		const gainNode = ctx.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(ctx.destination);

		oscillator.frequency.value = frequency;
		oscillator.type = 'sine';

		gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
		gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

		oscillator.start(ctx.currentTime);
		oscillator.stop(ctx.currentTime + duration / 1000);
	} catch (err) {
		console.error('Beep error:', err);
	}
}

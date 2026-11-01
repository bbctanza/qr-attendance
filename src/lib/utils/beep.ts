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

// ---------------------------------------------------------------------------
// Scan feedback vocabulary
// ---------------------------------------------------------------------------
//
// A USB scanner beeps on every successful *read* of a barcode, which people hear as "you're
// checked in" — the single biggest source of confusion at the desk. We can't silence the
// hardware, so the app speaks in its own distinct voice instead: every scan draws a response,
// and the responses differ by meaning. Silence now reliably means "not registered".

/**
 * Fired the instant a scan is accepted into the queue, before any network work.
 * This is the important one: it is the immediate "I have you" the hardware beep only implies.
 */
export function playAccepted() {
	playBeep(1400, 60);
}

/** Checked in. Two bright notes - clearly different from the single accept tick. */
export function playSuccess() {
	playBeep(1000, 150);
	setTimeout(() => playBeep(1000, 150), 150);
}

/** Already checked in. Two flat low notes: not an error, but not a new check-in either. */
export function playDuplicate() {
	playBeep(500, 120);
	setTimeout(() => playBeep(500, 120), 160);
}

/** Scan turned away (re-scan inside the dedupe window, or the queue is full). */
export function playRejected() {
	playBeep(220, 260);
}

/** Check-in failed. Longer and lower than everything else. */
export function playError() {
	playBeep(400, 300);
}

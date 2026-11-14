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

/**
 * One tone.
 *
 * Two things make this carry where the previous version did not. **The waveform**: a sine is
 * the quietest shape at a given amplitude, where a square is all odd harmonics and cuts
 * through a room of people talking - it is what a supermarket scanner actually sounds like.
 * **The envelope**: the old one ramped down from the very first millisecond, so a short tone
 * was mostly silence with a click at the front, which is why it read as faint. This holds the
 * note at full level and only releases at the end, with a 3 ms attack so it still never clicks.
 *
 * Gain is 0.55 rather than 0.3 for the same reason. Kept in step with the kiosk's own
 * `kiosk-rs/src/lib/kiosk/beep.ts`, which has the identical vocabulary - a member hears the
 * same sounds whichever device they check in on.
 */
const GAIN = 0.55;

export function playBeep(frequency = 2300, duration = 90, type: OscillatorType = 'square') {
	try {
		const ctx = getAudioContext();
		if (!ctx) return;
		if (ctx.state !== 'running') ctx.resume().catch(() => {});

		const oscillator = ctx.createOscillator();
		const gainNode = ctx.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(ctx.destination);

		oscillator.frequency.value = frequency;
		oscillator.type = type;

		const now = ctx.currentTime;
		const seconds = duration / 1000;
		const attack = 0.003;
		const release = Math.min(0.02, seconds * 0.3);

		// exponentialRampToValueAtTime cannot reach or start from 0, hence 0.0001.
		gainNode.gain.setValueAtTime(0.0001, now);
		gainNode.gain.exponentialRampToValueAtTime(GAIN, now + attack);
		gainNode.gain.setValueAtTime(GAIN, now + seconds - release);
		gainNode.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

		oscillator.start(now);
		oscillator.stop(now + seconds);
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
	playBeep(2300, 90, 'square');
}

/** Checked in. Two bright notes - clearly different from the single accept tick. */
export function playSuccess() {
	playBeep(1850, 110, 'square');
	setTimeout(() => playBeep(2450, 150, 'square'), 120);
}

/** Already checked in. Two flat low notes: not an error, but not a new check-in either. */
export function playDuplicate() {
	playBeep(700, 130, 'square');
	setTimeout(() => playBeep(700, 130, 'square'), 170);
}

/** Scan turned away (re-scan inside the dedupe window, or the queue is full). */
export function playRejected() {
	// Sawtooth, not square: buzzier and obviously unlike the two "accepted" tones above.
	playBeep(240, 320, 'sawtooth');
}

/** Check-in failed. Longer and lower than everything else. */
export function playError() {
	playBeep(380, 360, 'sawtooth');
}

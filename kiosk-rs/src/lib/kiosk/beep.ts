/**
 * Scan feedback sounds.
 *
 * Ported from the web app's src/lib/utils/beep.ts, including its feedback vocabulary - the
 * reasoning behind the distinct tones is the valuable part and is reproduced below.
 *
 * Two kiosk deviations, both because this runs at a door rather than on a desk:
 * - Volume is a 0-100 device setting (0 = muted), where the web app hardcodes its gain.
 * - The tones themselves are retuned to sound like a *scanner*. The web app's sine waves at
 *   60-150 ms were inaudible across a room; these are square waves, higher and held, with a
 *   real attack/hold/release envelope. See `playBeep` for why each of those matters.
 *
 * Browsers keep an AudioContext "suspended" unless it is created or resumed during a user
 * gesture. Scan callbacks are not user gestures, so one context is shared and unlocked on the
 * first tap/click/keypress. On a kiosk that first gesture is usually the scanner itself
 * typing a code, which counts as a keydown - so the very first scan of the day can be silent
 * and every one after it audible. `setupAudioUnlock()` is called on mount to narrow that
 * window as much as a webview allows.
 */

let audioContext: AudioContext | null = null;
let unlockListenersAdded = false;

/**
 * 0-1, scaled from the kiosk's 0-100 setting.
 *
 * Higher than the web app's 0.3 ceiling on purpose: that is tuned for a laptop on a desk, and
 * this runs at a door with a queue in front of it. A tone nobody hears over the room does the
 * job of no tone at all.
 */
let gainScale = 0.55;

/** Called whenever the Beep volume setting changes. 0 mutes without tearing down the context. */
export function setBeepVolume(percent: number) {
	const clamped = Math.max(0, Math.min(100, percent));
	gainScale = (clamped / 100) * 0.55;
}

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioContext) {
		const Ctx =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
 * Two things make this carry where the previous version did not. The waveform: a sine is the
 * quietest shape at a given amplitude, where a square is all odd harmonics and cuts through a
 * noisy room - it is what a supermarket scanner actually sounds like. And the envelope: the
 * old one started decaying from the first millisecond, so a 60 ms tone was mostly silence with
 * a click at the front. This holds the note, then releases, with a 3 ms attack so it still
 * doesn't click.
 */
export function playBeep(frequency = 2300, duration = 90, type: OscillatorType = 'square') {
	// Muted: skip the work entirely rather than scheduling a silent oscillator.
	if (gainScale <= 0) return;

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

		gainNode.gain.setValueAtTime(0.0001, now);
		gainNode.gain.exponentialRampToValueAtTime(gainScale, now + attack);
		gainNode.gain.setValueAtTime(gainScale, now + seconds - release);
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
// checked in" - the single biggest source of confusion at the desk. We can't silence the
// hardware, so the app speaks in its own distinct voice instead: every scan draws a response,
// and the responses differ by meaning. Silence now reliably means "not registered".

/**
 * Fired the instant a scan is accepted, before any network work.
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

/** Scan turned away (unknown code, or the event won't take it). */
export function playRejected() {
	// Sawtooth, not square: buzzier and obviously unlike the two "accepted" tones above.
	playBeep(240, 320, 'sawtooth');
}

/** Check-in failed outright. Longer and lower than everything else. */
export function playError() {
	playBeep(380, 360, 'sawtooth');
}

/**
 * Kiosk-only: saved to the offline queue but not yet on the server.
 *
 * Two notes like success, but falling rather than level - "got it, not confirmed". The web
 * app has no equivalent because it has no offline queue; staff need to be able to hear the
 * difference without reading the screen.
 */
export function playQueued() {
	playBeep(2000, 110, 'square');
	setTimeout(() => playBeep(1300, 170, 'square'), 130);
}

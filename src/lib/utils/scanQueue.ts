import { writable, type Readable } from 'svelte/store';

/**
 * Serialized scan queue.
 *
 * A USB scanner fires in milliseconds; the check-in round-trip takes seconds. Previously a scan
 * arriving during that window was thrown away — the person heard the scanner's own beep, assumed
 * they were checked in, and walked away unrecorded. Here nothing is dropped: scans wait their
 * turn and are processed one at a time, in order.
 *
 * The queue is deliberately UI-agnostic. It owns *what happens* to a scan; the overlay only
 * renders the state it publishes.
 */

export type ScanSource = 'camera' | 'usb' | 'manual';

export type ScanPhase = 'idle' | 'processing' | 'success' | 'duplicate' | 'error';

/** Why a submitted code was accepted or turned away. The caller maps these to sounds. */
export type SubmitResult = 'queued' | 'duplicate-ignored' | 'rejected-full';

/**
 * A scan the queue turned away, for the UI to surface. Carried as a kind rather than a message
 * so the wording stays with the component that renders it.
 */
export type ScanRejection = { kind: 'duplicate' | 'full' };

/** Shape the processor returns; the queue stores it for the overlay to render. */
export interface ScanOutcome {
	phase: 'success' | 'duplicate' | 'error';
	memberName?: string;
	memberId?: string;
	careGroup?: string;
	time?: string;
	message?: string;
}

export interface ScanQueueState {
	phase: ScanPhase;
	/** Code currently being processed, shown while we wait so the operator sees what was read. */
	currentCode: string | null;
	currentSource: ScanSource | null;
	/** Result of the most recent scan, held while phase is success/duplicate/error. */
	outcome: ScanOutcome | null;
	/** How many scans are waiting behind the current one. */
	queueDepth: number;
}

export interface ScanQueueOptions {
	/** Performs the actual check-in. Should resolve, not throw, for expected failures. */
	process: (code: string, source: ScanSource) => Promise<ScanOutcome>;
	/**
	 * How long the result stays on screen before the next scan starts. Called per result so the
	 * page can shorten it while a queue is backed up.
	 */
	resultHoldMs: (queueDepth: number) => number;
	/** Re-scanning the same code inside this window is one impatient person, not two people. */
	dedupeWindowMs?: number;
	/** Upper bound on waiting scans, so a stuck trigger can't build an endless backlog. */
	maxDepth?: number;
}

export interface ScanQueue extends Readable<ScanQueueState> {
	submit: (code: string, source: ScanSource) => SubmitResult;
	/** Skip the remaining result hold and move on (user tapped "Continue"). */
	dismissResult: () => void;
	/** Drop everything pending and return to idle. */
	reset: () => void;
	destroy: () => void;
}

const IDLE_STATE: ScanQueueState = {
	phase: 'idle',
	currentCode: null,
	currentSource: null,
	outcome: null,
	queueDepth: 0
};

export function createScanQueue({
	process,
	resultHoldMs,
	dedupeWindowMs = 10_000,
	maxDepth = 5
}: ScanQueueOptions): ScanQueue {
	const { subscribe, set, update } = writable<ScanQueueState>({ ...IDLE_STATE });

	const pending: { code: string; source: ScanSource }[] = [];
	/** code -> timestamp it was last accepted, for the dedupe window. */
	const recentlySeen = new Map<string, number>();

	let running = false;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingResolve: (() => void) | null = null;
	let destroyed = false;

	function clearHold() {
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	/**
	 * Forget dedupe entries that have aged out, so the map can't grow without bound over a long
	 * scanning session and so a member can legitimately be re-scanned later.
	 */
	function prune(now: number) {
		for (const [code, seenAt] of recentlySeen) {
			if (now - seenAt > dedupeWindowMs) recentlySeen.delete(code);
		}
	}

	function submit(code: string, source: ScanSource): SubmitResult {
		if (destroyed) return 'rejected-full';

		const trimmed = code.trim();
		if (!trimmed) return 'duplicate-ignored';

		const now = Date.now();
		prune(now);

		// Covers both the impatient re-scan and the camera re-reading the same code every frame,
		// which is why the old 2s camera-only cooldown is no longer needed.
		const seenAt = recentlySeen.get(trimmed);
		if (seenAt !== undefined && now - seenAt < dedupeWindowMs) {
			return 'duplicate-ignored';
		}

		if (pending.length >= maxDepth) return 'rejected-full';

		recentlySeen.set(trimmed, now);
		pending.push({ code: trimmed, source });
		update((s) => ({ ...s, queueDepth: pending.length }));

		void drain();
		return 'queued';
	}

	async function drain() {
		if (running || destroyed) return;
		running = true;

		try {
			while (pending.length > 0 && !destroyed) {
				const next = pending.shift()!;

				update((s) => ({
					...s,
					phase: 'processing',
					currentCode: next.code,
					currentSource: next.source,
					outcome: null,
					queueDepth: pending.length
				}));

				let outcome: ScanOutcome;
				try {
					outcome = await process(next.code, next.source);
				} catch (e) {
					// The processor is expected to handle its own errors; this is the last resort
					// so one bad scan can never wedge the queue for everyone behind it.
					console.error('Scan processing threw:', e);
					outcome = {
						phase: 'error',
						memberId: next.code,
						message: e instanceof Error ? e.message : 'Check-in failed'
					};
				}

				if (destroyed) return;

				// A failed scan was never recorded, so the member must be able to try again at
				// once rather than being locked out for the rest of the dedupe window.
				if (outcome.phase === 'error') recentlySeen.delete(next.code);

				update((s) => ({
					...s,
					phase: outcome.phase,
					outcome,
					queueDepth: pending.length
				}));

				// Hold the result on screen long enough to be read, but shorten it when people are
				// waiting so the line keeps moving.
				await hold(resultHoldMs(pending.length));
			}

			if (!destroyed) set({ ...IDLE_STATE });
		} finally {
			running = false;
		}
	}

	function hold(ms: number): Promise<void> {
		clearHold();
		pendingResolve = null;
		if (ms <= 0) return Promise.resolve();

		return new Promise((resolve) => {
			// One finish path for both the timer and an early dismiss, so a natural expiry can't
			// leave a stale resolver behind for the next dismissResult() to fire.
			const finish = () => {
				clearHold();
				pendingResolve = null;
				resolve();
			};

			pendingResolve = finish;
			holdTimer = setTimeout(finish, ms);
		});
	}

	/** No-op unless a result is currently being held. */
	function dismissResult() {
		pendingResolve?.();
	}

	function reset() {
		pending.length = 0;
		recentlySeen.clear();
		clearHold();
		pendingResolve = null;
		set({ ...IDLE_STATE });
	}

	function destroy() {
		destroyed = true;
		reset();
	}

	return { subscribe, submit, dismissResult, reset, destroy };
}

import type { ScanRpcResult } from '$lib/api/attendance';

/**
 * Durable queue for scans taken while the device is offline.
 *
 * PLAN.md section 2 says the web app's `scanQueue.ts` is "the existing offline queue ...
 * plain browser JS/localStorage". It is not: that module is an in-memory *serializer* that
 * processes one scan at a time with a dedupe window, and it persists nothing. The web app has
 * no offline queue at all - a scan taken with the network down is lost.
 *
 * The kiosk UI already promises otherwise ("Saved - will sync", a queued count in the status
 * strip), and a kiosk at a door is exactly where the network drops. So this is the real thing:
 * pending scans survive a reload, a crash and a power cut, and flush in order when the
 * connection returns.
 *
 * Deliberately small and dependency-free so it can move back into the web app later.
 */

const STORAGE_KEY = 'kiosk.pendingScans';

/** Bounded so a long outage can't fill the webview's storage quota and start throwing. */
const MAX_PENDING = 500;

export interface PendingScan {
	code: string;
	eventId: number;
	/** ISO time the person actually scanned - NOT the time we eventually sync it. */
	at: string;
	/**
	 * Event name at the moment of the scan, carried only so "View queued scans" can name it.
	 * Optional: entries written before this field existed are still valid, and the event may
	 * well be over by the time anyone looks, so re-fetching the name later is not an option.
	 */
	eventName?: string;
}

/** Outcome of one flush pass, for the status strip and the Sync settings group. */
export interface FlushReport {
	/** Reached the server and were accepted. */
	synced: number;
	/** Reached the server and were refused (already scanned, unknown member, event closed). */
	refused: number;
	/** Still queued - the connection failed again partway through. */
	remaining: number;
}

function read(): PendingScan[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		// Anything unrecognisable is dropped rather than crashing the kiosk on boot.
		return Array.isArray(parsed) ? (parsed as PendingScan[]).filter(isPendingScan) : [];
	} catch (e) {
		console.error('[offline-queue] could not read pending scans', e);
		return [];
	}
}

function isPendingScan(value: unknown): value is PendingScan {
	if (!value || typeof value !== 'object') return false;
	const scan = value as Partial<PendingScan>;
	return (
		typeof scan.code === 'string' &&
		typeof scan.eventId === 'number' &&
		typeof scan.at === 'string'
	);
}

function write(scans: PendingScan[]) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
	} catch (e) {
		// Quota or private-mode failure. Losing the newest scan is bad but silently pretending
		// it was stored is worse, so this is loud.
		console.error('[offline-queue] could not persist pending scans', e);
	}
}

export const offlineQueue = {
	/** How many scans are waiting. Read on boot so a power cut doesn't hide a backlog. */
	size(): number {
		return read().length;
	},

	list(): PendingScan[] {
		return read();
	},

	/** Returns false when the queue is full, so the caller can tell the operator. */
	enqueue(code: string, eventId: number, at: Date, eventName?: string): boolean {
		const scans = read();
		if (scans.length >= MAX_PENDING) {
			console.error('[offline-queue] queue full, scan dropped', code);
			return false;
		}
		scans.push({ code, eventId, at: at.toISOString(), eventName });
		write(scans);
		return true;
	},

	clear() {
		write([]);
	},

	/**
	 * Send everything pending, oldest first.
	 *
	 * Each scan is replayed with its *original* timestamp, so a check-in taken at 14:02 and
	 * synced at 14:40 is still recorded as 14:02. Stops at the first transport failure and
	 * keeps the rest queued - a scan that reached the server is removed even if the server
	 * refused it, because the server's answer is the record.
	 *
	 * Re-entrant calls join the flush already running instead of starting a second one. There
	 * are four independent callers (boot, the `online` event, an account switch, and the
	 * "Retry now" button) and nothing stops two of them overlapping - tapping "Retry now" as
	 * the network returns is enough. Two passes each read the same pending list at the top and
	 * would then send every queued scan twice, leaving the server to reject the duplicates and
	 * both passes writing a wrong `remaining` back to the UI.
	 */
	flush(
		send: (code: string, eventId: number, at: Date) => Promise<ScanRpcResult>
	): Promise<FlushReport> {
		if (inFlight) return inFlight;
		inFlight = runFlush(send).finally(() => {
			inFlight = null;
		});
		return inFlight;
	}
};

/** The flush currently running, if any. See `offlineQueue.flush`. */
let inFlight: Promise<FlushReport> | null = null;

async function runFlush(
	send: (code: string, eventId: number, at: Date) => Promise<ScanRpcResult>
): Promise<FlushReport> {
	{
		const scans = read();
		let synced = 0;
		let refused = 0;

		while (scans.length > 0) {
			const next = scans[0];
			try {
				const result = await send(next.code, next.eventId, new Date(next.at));
				if (result.success) synced += 1;
				else refused += 1;
			} catch (e) {
				// Transport failure: still offline. Keep this one and everything behind it.
				console.warn('[offline-queue] flush interrupted, keeping remainder', e);
				break;
			}
			scans.shift();
			// Persist after each one so a crash mid-flush can't replay an accepted scan.
			write(scans);
		}

		return { synced, refused, remaining: scans.length };
	}
}

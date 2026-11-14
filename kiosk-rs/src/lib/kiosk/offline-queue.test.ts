import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineQueue, type PendingScan } from './offline-queue';
import type { ScanRpcResult } from '$lib/api/attendance';

/**
 * The offline queue is the one piece of the kiosk whose failure is silent: a bug here doesn't
 * throw, it just loses somebody's check-in. The web app has no equivalent (its `scanQueue.ts`
 * persists nothing), so none of this logic is covered anywhere else.
 *
 * Runs in plain Node with a stubbed localStorage rather than under jsdom - the stub is a few
 * lines, and being able to make `setItem` throw is how the quota path gets tested at all.
 */

interface StorageStub {
	store: Map<string, string>;
	failOnWrite: boolean;
}

function installStorage(): StorageStub {
	const stub: StorageStub = { store: new Map(), failOnWrite: false };

	(globalThis as { localStorage?: unknown }).localStorage = {
		getItem: (key: string) => stub.store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			if (stub.failOnWrite) throw new Error('QuotaExceededError');
			stub.store.set(key, value);
		},
		removeItem: (key: string) => void stub.store.delete(key),
		clear: () => stub.store.clear()
	};

	return stub;
}

const ACCEPTED: ScanRpcResult = { success: true, message: 'Checked in' };
const REFUSED: ScanRpcResult = { success: false, message: 'Already checked in' };

let storage: StorageStub;

beforeEach(() => {
	storage = installStorage();
	// console.error is expected on the failure paths; keep the test output readable.
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('enqueue and persistence', () => {
	it('persists scans and reports the size', () => {
		expect(offlineQueue.size()).toBe(0);

		expect(offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'))).toBe(true);
		expect(offlineQueue.enqueue('M-2', 7, new Date('2026-11-13T14:03:00Z'))).toBe(true);

		expect(offlineQueue.size()).toBe(2);
	});

	it('survives a reload, because the queue lives in storage and not in memory', () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));

		// A reload keeps the storage contents but resets every module-level variable. Reading
		// through the public API proves nothing is being cached in the module.
		const raw = storage.store.get('kiosk.pendingScans');
		expect(raw).toBeTruthy();
		expect(JSON.parse(raw as string)).toHaveLength(1);
		expect(offlineQueue.size()).toBe(1);
	});

	it('records the scan time, not the sync time', () => {
		const scannedAt = new Date('2026-11-13T14:02:00Z');
		offlineQueue.enqueue('M-1', 7, scannedAt);

		const [pending] = offlineQueue.list();
		expect(pending.at).toBe(scannedAt.toISOString());
	});

	it('carries the event name for the queue viewer', () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'), 'Choir Practice');

		const [pending] = offlineQueue.list();
		expect(pending.eventName).toBe('Choir Practice');
		expect(pending.eventId).toBe(7);
	});

	it('still accepts entries stored before eventName existed', () => {
		// A device that queued scans on the previous build must not lose them on upgrade:
		// the field is optional precisely so these stay valid.
		storage.store.set(
			'kiosk.pendingScans',
			JSON.stringify([{ code: 'M-old', eventId: 7, at: '2026-11-13T14:02:00Z' }])
		);

		expect(offlineQueue.size()).toBe(1);
		expect(offlineQueue.list()[0].eventName).toBeUndefined();
	});

	it('sends an upgraded entry with no event name exactly like any other', async () => {
		storage.store.set(
			'kiosk.pendingScans',
			JSON.stringify([{ code: 'M-old', eventId: 7, at: '2026-11-13T14:02:00Z' }])
		);

		const seen: string[] = [];
		const report = await offlineQueue.flush(async (code) => {
			seen.push(code);
			return ACCEPTED;
		});

		expect(seen).toEqual(['M-old']);
		expect(report).toEqual({ synced: 1, refused: 0, remaining: 0 });
	});

	it('refuses a scan once MAX_PENDING is reached rather than growing without bound', () => {
		for (let i = 0; i < 500; i += 1) {
			expect(offlineQueue.enqueue(`M-${i}`, 7, new Date())).toBe(true);
		}
		expect(offlineQueue.size()).toBe(500);

		// The caller needs the false to tell the operator the scan was NOT saved.
		expect(offlineQueue.enqueue('M-overflow', 7, new Date())).toBe(false);
		expect(offlineQueue.size()).toBe(500);
	});

	it('does not throw when storage itself rejects the write', () => {
		storage.failOnWrite = true;
		expect(() => offlineQueue.enqueue('M-1', 7, new Date())).not.toThrow();
	});

	it('ignores corrupt storage instead of crashing on boot', () => {
		storage.store.set('kiosk.pendingScans', 'not json at all');
		expect(offlineQueue.size()).toBe(0);

		storage.store.set('kiosk.pendingScans', '{"not":"an array"}');
		expect(offlineQueue.size()).toBe(0);

		// A valid array with junk entries keeps the good ones and drops the rest.
		storage.store.set(
			'kiosk.pendingScans',
			JSON.stringify([{ code: 'M-1', eventId: 7, at: '2026-11-13T14:02:00Z' }, { nope: true }, null])
		);
		expect(offlineQueue.size()).toBe(1);
	});
});

describe('flush', () => {
	it('does nothing when the queue is empty', async () => {
		const send = vi.fn();
		const report = await offlineQueue.flush(send);

		expect(send).not.toHaveBeenCalled();
		expect(report).toEqual({ synced: 0, refused: 0, remaining: 0 });
	});

	it('sends oldest first, replaying each original timestamp', async () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));
		offlineQueue.enqueue('M-2', 7, new Date('2026-11-13T14:05:00Z'));
		offlineQueue.enqueue('M-3', 9, new Date('2026-11-13T14:09:00Z'));

		const seen: Array<[string, number, string]> = [];
		const report = await offlineQueue.flush(async (code, eventId, at) => {
			seen.push([code, eventId, at.toISOString()]);
			return ACCEPTED;
		});

		expect(seen).toEqual([
			['M-1', 7, '2026-11-13T14:02:00.000Z'],
			['M-2', 7, '2026-11-13T14:05:00.000Z'],
			['M-3', 9, '2026-11-13T14:09:00.000Z']
		]);
		expect(report).toEqual({ synced: 3, refused: 0, remaining: 0 });
		expect(offlineQueue.size()).toBe(0);
	});

	it('drops a scan the server refused, because the server answer is the record', async () => {
		offlineQueue.enqueue('M-dupe', 7, new Date('2026-11-13T14:02:00Z'));

		const report = await offlineQueue.flush(async () => REFUSED);

		expect(report).toEqual({ synced: 0, refused: 1, remaining: 0 });
		// Critically NOT retried forever: it reached the server and was answered.
		expect(offlineQueue.size()).toBe(0);
	});

	it('stops at the first transport failure and keeps that scan and everything behind it', async () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));
		offlineQueue.enqueue('M-2', 7, new Date('2026-11-13T14:05:00Z'));
		offlineQueue.enqueue('M-3', 7, new Date('2026-11-13T14:09:00Z'));

		let calls = 0;
		const report = await offlineQueue.flush(async () => {
			calls += 1;
			if (calls === 2) throw new Error('network down again');
			return ACCEPTED;
		});

		// Only the first was accepted; the thrower and the one behind it are still queued.
		expect(calls).toBe(2);
		expect(report).toEqual({ synced: 1, refused: 0, remaining: 2 });
		expect(offlineQueue.list().map((s: PendingScan) => s.code)).toEqual(['M-2', 'M-3']);
	});

	it('persists after each send, so a crash mid-flush cannot replay an accepted scan', async () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));
		offlineQueue.enqueue('M-2', 7, new Date('2026-11-13T14:05:00Z'));

		await offlineQueue.flush(async (code) => {
			if (code === 'M-2') throw new Error('crash');
			return ACCEPTED;
		});

		// Storage - not just the in-memory report - must already reflect M-1 being gone.
		const persisted = JSON.parse(storage.store.get('kiosk.pendingScans') as string);
		expect(persisted.map((s: PendingScan) => s.code)).toEqual(['M-2']);
	});

	it('resumes cleanly on a later flush once the connection is back', async () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));
		offlineQueue.enqueue('M-2', 7, new Date('2026-11-13T14:05:00Z'));

		await offlineQueue.flush(async () => {
			throw new Error('offline');
		});
		expect(offlineQueue.size()).toBe(2);

		const report = await offlineQueue.flush(async () => ACCEPTED);
		expect(report).toEqual({ synced: 2, refused: 0, remaining: 0 });
		expect(offlineQueue.size()).toBe(0);
	});

	it('joins a flush already in progress instead of sending everything twice', async () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));
		offlineQueue.enqueue('M-2', 7, new Date('2026-11-13T14:05:00Z'));

		const sent: string[] = [];
		const send = async (code: string): Promise<ScanRpcResult> => {
			sent.push(code);
			// A real network call yields, which is exactly what lets a second flush interleave.
			await new Promise((resolve) => setTimeout(resolve, 0));
			return ACCEPTED;
		};

		// "Retry now" tapped as the online event fires, or boot racing a reconnect.
		const [first, second] = await Promise.all([
			offlineQueue.flush(send),
			offlineQueue.flush(send)
		]);

		// Each scan reaches the server exactly once; before the guard this was
		// ['M-1', 'M-1', 'M-2', 'M-2'].
		expect(sent).toEqual(['M-1', 'M-2']);
		// The joining caller gets the real result rather than a misleading empty report.
		expect(first).toEqual({ synced: 2, refused: 0, remaining: 0 });
		expect(second).toEqual(first);
		expect(offlineQueue.size()).toBe(0);
	});

	it('allows a new flush once the previous one has settled', async () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));
		await offlineQueue.flush(async () => ACCEPTED);

		// The guard must not latch: a later reconnect has to be able to flush again.
		offlineQueue.enqueue('M-2', 7, new Date('2026-11-13T14:09:00Z'));
		const report = await offlineQueue.flush(async () => ACCEPTED);
		expect(report).toEqual({ synced: 1, refused: 0, remaining: 0 });
	});

	it('releases the guard even when the flush fails throughout', async () => {
		offlineQueue.enqueue('M-1', 7, new Date('2026-11-13T14:02:00Z'));
		await offlineQueue.flush(async () => {
			throw new Error('offline');
		});

		// A failed flush must leave the door open for the next attempt.
		const report = await offlineQueue.flush(async () => ACCEPTED);
		expect(report).toEqual({ synced: 1, refused: 0, remaining: 0 });
	});

	it('clear() empties the queue', () => {
		offlineQueue.enqueue('M-1', 7, new Date());
		offlineQueue.clear();
		expect(offlineQueue.size()).toBe(0);
	});
});

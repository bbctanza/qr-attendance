import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { createScanQueue, type ScanOutcome, type ScanQueueState } from './scanQueue';

/**
 * These cover the behaviour the scan desk actually depends on: that nothing is silently lost,
 * that an impatient re-scan doesn't check someone in twice, and that one failure can't wedge
 * the queue for everyone behind it.
 */

/** A processor whose completion is controlled by the test, to simulate a slow network. */
function deferredProcessor() {
	const calls: string[] = [];
	const resolvers: ((outcome: ScanOutcome) => void)[] = [];

	const process = (code: string) => {
		calls.push(code);
		return new Promise<ScanOutcome>((resolve) => {
			resolvers.push(resolve);
		});
	};

	return {
		calls,
		process,
		/** Finish the oldest in-flight scan. */
		finish(outcome: Partial<ScanOutcome> = {}) {
			const resolve = resolvers.shift();
			if (!resolve) throw new Error('nothing in flight to finish');
			resolve({ phase: 'success', ...outcome } as ScanOutcome);
		}
	};
}

/** Let queued microtasks settle. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createScanQueue', () => {
	it('queues scans that arrive while one is in flight instead of dropping them', async () => {
		const p = deferredProcessor();
		const queue = createScanQueue({ process: p.process, resultHoldMs: () => 0 });

		expect(queue.submit('AAA', 'usb')).toBe('queued');
		await tick();

		// B and C arrive mid-flight - the case that previously lost them entirely.
		expect(queue.submit('BBB', 'usb')).toBe('queued');
		expect(queue.submit('CCC', 'usb')).toBe('queued');

		expect(p.calls).toEqual(['AAA']);
		expect(get(queue).queueDepth).toBe(2);

		p.finish();
		await tick();
		expect(p.calls).toEqual(['AAA', 'BBB']);

		p.finish();
		await tick();
		p.finish();
		await tick();

		expect(p.calls).toEqual(['AAA', 'BBB', 'CCC']);
		expect(get(queue).phase).toBe('idle');
	});

	it('ignores the same code inside the dedupe window', async () => {
		const p = deferredProcessor();
		const queue = createScanQueue({
			process: p.process,
			resultHoldMs: () => 0,
			dedupeWindowMs: 10_000
		});

		expect(queue.submit('AAA', 'usb')).toBe('queued');
		await tick();

		// The impatient re-scan, and the camera re-reading the same code every frame.
		expect(queue.submit('AAA', 'usb')).toBe('duplicate-ignored');
		expect(queue.submit('AAA', 'camera')).toBe('duplicate-ignored');

		expect(p.calls).toEqual(['AAA']);
		expect(get(queue).queueDepth).toBe(0);
	});

	it('lets a failed scan be retried immediately rather than locking it out', async () => {
		const p = deferredProcessor();
		const queue = createScanQueue({
			process: p.process,
			resultHoldMs: () => 0,
			dedupeWindowMs: 10_000
		});

		queue.submit('AAA', 'usb');
		await tick();
		p.finish({ phase: 'error', message: 'network down' });
		await tick();

		// Nothing was recorded, so the member must be able to try again at once.
		expect(queue.submit('AAA', 'usb')).toBe('queued');
	});

	it('rejects scans beyond the depth cap', async () => {
		const p = deferredProcessor();
		const queue = createScanQueue({ process: p.process, resultHoldMs: () => 0, maxDepth: 2 });

		queue.submit('AAA', 'usb');
		await tick();

		expect(queue.submit('BBB', 'usb')).toBe('queued');
		expect(queue.submit('CCC', 'usb')).toBe('queued');
		// A stuck trigger must not build an endless backlog.
		expect(queue.submit('DDD', 'usb')).toBe('rejected-full');
	});

	it('keeps draining after a processor throws', async () => {
		const outcomes: ScanQueueState['phase'][] = [];
		let first = true;
		const queue = createScanQueue({
			process: async () => {
				if (first) {
					first = false;
					throw new Error('boom');
				}
				return { phase: 'success' } as ScanOutcome;
			},
			resultHoldMs: () => 0
		});

		queue.subscribe((s) => outcomes.push(s.phase));

		queue.submit('AAA', 'usb');
		queue.submit('BBB', 'usb');
		await tick();
		await tick();

		// One bad scan must not wedge the queue for everyone behind it.
		expect(outcomes).toContain('error');
		expect(outcomes).toContain('success');
	});

	it('shortens the result hold while scans are waiting', async () => {
		const p = deferredProcessor();
		const holds: number[] = [];
		const queue = createScanQueue({
			process: p.process,
			resultHoldMs: (depth) => {
				holds.push(depth);
				return 0;
			}
		});

		queue.submit('AAA', 'usb');
		await tick();
		queue.submit('BBB', 'usb');
		p.finish();
		await tick();
		p.finish();
		await tick();

		// First result reported a waiting scan; the last found the queue drained.
		expect(holds[0]).toBe(1);
		expect(holds.at(-1)).toBe(0);
	});

	it('dismissResult cuts a hold short without disturbing an in-flight scan', async () => {
		const p = deferredProcessor();
		const queue = createScanQueue({ process: p.process, resultHoldMs: () => 60_000 });

		queue.submit('AAA', 'usb');
		await tick();

		// No result is being held yet, so this must be a no-op rather than an error.
		expect(() => queue.dismissResult()).not.toThrow();

		p.finish();
		await tick();
		expect(get(queue).phase).toBe('success');

		queue.dismissResult();
		await tick();
		expect(get(queue).phase).toBe('idle');
	});

	it('does not fire a stale resolver after a hold expires naturally', async () => {
		vi.useFakeTimers();
		try {
			const p = deferredProcessor();
			const queue = createScanQueue({ process: p.process, resultHoldMs: () => 100 });

			queue.submit('AAA', 'usb');
			await vi.advanceTimersByTimeAsync(0);
			p.finish();
			await vi.advanceTimersByTimeAsync(200);

			expect(get(queue).phase).toBe('idle');
			// The expired hold must not leave a resolver behind for this to fire.
			expect(() => queue.dismissResult()).not.toThrow();
			expect(get(queue).phase).toBe('idle');
		} finally {
			vi.useRealTimers();
		}
	});
});

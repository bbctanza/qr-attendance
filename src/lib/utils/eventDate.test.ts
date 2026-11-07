import { describe, it, expect } from 'vitest';
import { parseEventDate } from './time';

describe('parseEventDate', () => {
	it('reads the calendar date at face value, not as UTC midnight', () => {
		const d = parseEventDate('2026-11-01');

		// new Date('2026-11-01') is UTC midnight, which is 31 October anywhere behind UTC.
		// These must hold regardless of the machine's timezone.
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(10);
		expect(d.getDate()).toBe(1);
	});

	it('keeps a month boundary on the right side', () => {
		const last = parseEventDate('2026-01-31');
		expect(last.getMonth()).toBe(0);
		expect(last.getDate()).toBe(31);

		const first = parseEventDate('2026-02-01');
		expect(first.getMonth()).toBe(1);
		expect(first.getDate()).toBe(1);
	});

	it('handles a leap day', () => {
		const d = parseEventDate('2028-02-29');
		expect(d.getMonth()).toBe(1);
		expect(d.getDate()).toBe(29);
	});

	it('tolerates a full timestamp by using its date part', () => {
		const d = parseEventDate('2026-07-04T23:30:00');
		expect(d.getMonth()).toBe(6);
		expect(d.getDate()).toBe(4);
	});
});

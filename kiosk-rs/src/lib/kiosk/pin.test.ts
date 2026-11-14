import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	attemptsRemaining,
	clearFailures,
	hashPin,
	isValidPinFormat,
	lockedForMs,
	matchesPin,
	registerFailure
} from './pin';

/**
 * The PIN is the only thing standing between a device at a door and its settings, and it is
 * verified on-device — so the correctness of the hash and the lockout is entirely ours.
 */
beforeEach(() => {
	const store = new Map<string, string>();
	(globalThis as { localStorage?: unknown }).localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear()
	};
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('pin format', () => {
	it('accepts exactly six digits', () => {
		expect(isValidPinFormat('123456')).toBe(true);
	});

	it('rejects anything else', () => {
		for (const bad of ['12345', '1234567', 'abcdef', '12 456', '', '12345a']) {
			expect(isValidPinFormat(bad)).toBe(false);
		}
	});
});

describe('hashing', () => {
	it('never stores the PIN itself', async () => {
		const record = await hashPin('314159');
		expect(record.hash).not.toContain('314159');
		expect(record.salt).not.toContain('314159');
		// SHA-256 as hex.
		expect(record.hash).toHaveLength(64);
	});

	it('salts, so the same PIN on two devices does not share a hash', async () => {
		const a = await hashPin('314159');
		const b = await hashPin('314159');
		expect(a.salt).not.toBe(b.salt);
		expect(a.hash).not.toBe(b.hash);
	});

	it('verifies the right PIN and rejects the wrong one', async () => {
		const record = await hashPin('314159');
		expect(await matchesPin('314159', record)).toBe(true);
		expect(await matchesPin('314158', record)).toBe(false);
		expect(await matchesPin('000000', record)).toBe(false);
	});

	it('rejects a malformed PIN without consulting the hash', async () => {
		const record = await hashPin('314159');
		expect(await matchesPin('31415', record)).toBe(false);
		expect(await matchesPin('', record)).toBe(false);
	});
});

describe('lockout', () => {
	it('allows the first four wrong tries without locking', () => {
		for (let i = 0; i < 4; i += 1) expect(registerFailure()).toBe(0);
		expect(lockedForMs()).toBe(0);
		expect(attemptsRemaining()).toBe(1);
	});

	it('locks for a minute on the fifth', () => {
		for (let i = 0; i < 4; i += 1) registerFailure();
		expect(registerFailure()).toBe(60_000);
		expect(lockedForMs()).toBeGreaterThan(0);
	});

	it('doubles the cooldown each further failure, to a ceiling', () => {
		for (let i = 0; i < 4; i += 1) registerFailure();
		expect(registerFailure()).toBe(60_000);
		expect(registerFailure()).toBe(120_000);
		expect(registerFailure()).toBe(240_000);
		expect(registerFailure()).toBe(480_000);
		expect(registerFailure()).toBe(900_000);
		// Ceiling, not unbounded: a kiosk must stay recoverable by the staff who own it.
		expect(registerFailure()).toBe(900_000);
	});

	it('survives a restart, so rebooting is not a way around it', () => {
		for (let i = 0; i < 5; i += 1) registerFailure();
		const locked = lockedForMs();
		expect(locked).toBeGreaterThan(0);

		// A reload resets module state but not localStorage; reading it back is the test.
		expect(lockedForMs()).toBeCloseTo(locked, -2);
	});

	it('expires on its own', () => {
		for (let i = 0; i < 5; i += 1) registerFailure();
		expect(lockedForMs(Date.now() + 61_000)).toBe(0);
	});

	it('a correct PIN wipes the record', () => {
		for (let i = 0; i < 5; i += 1) registerFailure();
		clearFailures();
		expect(lockedForMs()).toBe(0);
		expect(attemptsRemaining()).toBe(5);
	});
});

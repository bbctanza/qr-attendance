export function formatClock(date: Date, format: '12h' | '24h', withSeconds = false): string {
	return date.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		...(withSeconds ? { second: '2-digit' } : {}),
		hour12: format === '12h'
	});
}

export function formatDay(date: Date): string {
	return date.toLocaleDateString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}

export interface Countdown {
	hours: number;
	minutes: number;
	seconds: number;
	totalMs: number;
}

/** Null once the target has passed - the caller distinguishes "overdue" from "no event". */
export function countdownTo(target: Date, from: Date): Countdown | null {
	const ms = target.getTime() - from.getTime();
	if (ms <= 0) return null;
	return {
		hours: Math.floor(ms / 3600_000),
		minutes: Math.floor((ms % 3600_000) / 60_000),
		seconds: Math.floor((ms % 60_000) / 1000),
		totalMs: ms
	};
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

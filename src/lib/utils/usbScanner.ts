// USB/HID QR scanners ("keyboard wedge", no driver needed) act like a keyboard: they type
// the decoded text as a very fast burst of keystrokes followed by Enter (or Tab).
// We tell them apart from a person typing by the gap between keys — scanners send a key
// every few milliseconds, people rarely type faster than ~80ms per key.

export interface UsbScannerOptions {
	onScan: (code: string) => void;
	/** Max time between keystrokes (ms) for them to count as one scanner burst. */
	maxKeyGapMs?: number;
	/** Minimum characters for a burst to be treated as a scan. */
	minLength?: number;
}

export function listenForUsbScanner({
	onScan,
	maxKeyGapMs = 50,
	minLength = 3
}: UsbScannerOptions): () => void {
	if (typeof window === 'undefined') return () => {};

	let buffer = '';
	let lastKeyTime = 0;

	function handleKeydown(e: KeyboardEvent) {
		if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
		// Modifier keys (Shift for uppercase letters) are part of a burst but carry no text
		if (e.key === 'Shift' || e.key === 'CapsLock') return;

		// Held-down keys auto-repeat fast enough to look like a scanner
		if (e.repeat) {
			buffer = '';
			return;
		}

		const gap = e.timeStamp - lastKeyTime;
		lastKeyTime = e.timeStamp;

		if (e.key === 'Enter' || e.key === 'Tab') {
			const code = buffer;
			buffer = '';
			if (code.length < minLength || gap > maxKeyGapMs) return;

			// It's a scan: keep the Enter/Tab from submitting forms, clicking focused buttons,
			// or reaching the page's own keydown handlers (e.g. manual check-in input).
			e.preventDefault();
			e.stopImmediatePropagation();
			removeTypedCode(e.target, code);

			const trimmed = code.trim();
			if (trimmed) onScan(trimmed);
			return;
		}

		if (e.key.length !== 1) {
			buffer = '';
			return;
		}

		buffer = gap > maxKeyGapMs ? e.key : buffer + e.key;
	}

	window.addEventListener('keydown', handleKeydown, true);
	return () => window.removeEventListener('keydown', handleKeydown, true);
}

// If a text field had focus, the scanner's keystrokes were typed into it. Strip them back
// out and fire an input event so bound state (search queries etc.) stays in sync.
function removeTypedCode(target: EventTarget | null, code: string) {
	if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
	if (!target.value.endsWith(code)) return;

	target.value = target.value.slice(0, -code.length);
	target.dispatchEvent(new Event('input', { bubbles: true }));
}

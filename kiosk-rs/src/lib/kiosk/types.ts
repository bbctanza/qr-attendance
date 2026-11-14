export interface KioskEvent {
	/** Numeric in the database (events.event_id is a bigint), not a slug. */
	event_id: number;
	event_name: string;
	start_datetime: string;
	checked_in: number;
}

export type ScanOutcome = 'success' | 'duplicate' | 'rejected';

export interface ScanResult {
	outcome: ScanOutcome;
	/** Null on `rejected` - an unknown code has no member to name. */
	member_name: string | null;
	/** The scanned code itself, which is the member id. Null on `rejected`. */
	member_code: string | null;
	/** Secondary identifier from the scan RPC, shown under the name when present. */
	care_group: string | null;
	/** Wall-clock time the scan was accepted, or the earlier time for a duplicate. */
	at: Date;
	/** True when the scan went into the offline queue instead of reaching the server. */
	queued: boolean;
	/** Shown on `rejected`: why the code was refused. */
	reason: string | null;
}

export type Screen = 'scan' | 'settings';

export interface KioskSettings {
	deviceName: string;
	theme: 'dark' | 'light';
	fullscreenLock: boolean;
	startOnBoot: boolean;
	usbScanner: boolean;
	camera: boolean;
	/**
	 * Which camera to use. Null means "pick one" — a rear-facing camera when the device has
	 * one, as the web app's scan page does, otherwise the first listed.
	 */
	cameraId: string | null;
	/** Mirror the preview. The web app offers the same toggle on its scanner. */
	cameraMirrored: boolean;
	/**
	 * Fill the screen with the camera feed, as the web app's `toggleFullscreen()` does. On a
	 * door kiosk this is what lets someone line a code up from a distance.
	 */
	cameraFullscreen: boolean;
	/**
	 * Where the "Show your QR code here" guide sits over the feed, and how many idle seconds
	 * before it appears. Same names, values and defaults as the web app's `cameraGuidePosition`
	 * and `cameraGuideIdleTime`; 0 shows it permanently, 'off' never shows it.
	 */
	cameraGuidePosition: 'top' | 'bottom' | 'off';
	cameraGuideIdleTime: number;
	/**
	 * Wide scan box instead of the default 250x250, matching the web app's `isWideScan`.
	 * Helps when the code is held further back, which is the normal case at a door.
	 */
	cameraWideScan: boolean;
	/**
	 * 12h/24h clock. Device-local in the web app too (`localStorage.time_format`), which is
	 * why it is here and not on SharedSettings.
	 */
	timeFormat: '12h' | '24h';
	/**
	 * Minutes the settings password stays accepted after it is entered. 0 asks every time.
	 * Counted from when the password was entered, not from the last tap, so the window is
	 * predictable rather than something that can be extended indefinitely by popping in and out.
	 */
	elevationMinutes: number;
	/** Ignore a repeat of the same code inside this many seconds. */
	debounceSeconds: number;
	beepVolume: number;
	/** Null means "follow whichever event is ongoing". */
	pinnedEventId: number | null;
}

/**
 * Settings owned by the web app, from the `system_settings` row. Read-only here - see
 * PLAN.md section 4.
 *
 * Note what is NOT here: **time format**. PLAN.md listed it as a shared setting, but it isn't
 * in `system_settings` at all - the web app keeps it per-device in `localStorage` under
 * `time_format`. It is a device preference in both apps, so it lives on KioskSettings.
 */
export interface SharedSettings {
	siteName: string;
	/**
	 * The organisation's own name, from `qr_header_title` (e.g. "BIBLE BAPTIST CHURCH TANZA")
	 * as against `site_name`, which names the system ("BBCT-QR-Attendance"). PLAN.md's status
	 * strip mockup reads "ORG NAME · Attendance Kiosk", so this is the alternative to show
	 * there - loaded because it is in the same row and costs nothing.
	 */
	orgName: string;
	/** Hex, e.g. "#275032". Applied to the --primary token for visual continuity. */
	primaryColor: string;
	timezone: string;
	/** Seconds a result stays on screen, from `scan_modal_duration`. */
	resultDuration: number;
	/** From `scan_modal_enabled`: whether the result shows member detail or just the outcome. */
	resultDetailEnabled: boolean;
}

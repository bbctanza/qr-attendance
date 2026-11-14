import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';

/**
 * The native shell: the two things a webview cannot do for itself.
 *
 * Every function here is a no-op outside Tauri. The kiosk is developed and tested in a plain
 * browser on `pnpm dev` (the whole scan flow works there), so these must degrade quietly
 * rather than throw - a settings screen that explodes in the browser would cost more than the
 * feature is worth.
 *
 * `supported` is what the UI uses to disable the controls it cannot honour, so a browser shows
 * them visibly unavailable instead of silently doing nothing when tapped.
 */
export const supported = isTauri();

/**
 * OS-level fullscreen, not F11 inside a browser. This is the difference the whole port exists
 * for: a stray keypress cannot drop a Tauri window out of fullscreen the way it can a tab.
 */
export async function setFullscreen(on: boolean): Promise<void> {
	if (!supported) return;
	try {
		await getCurrentWindow().setFullscreen(on);
	} catch (e) {
		console.error('[shell] could not change fullscreen', e);
	}
}

export async function isFullscreen(): Promise<boolean> {
	if (!supported) return false;
	try {
		return await getCurrentWindow().isFullscreen();
	} catch (e) {
		console.error('[shell] could not read fullscreen state', e);
		return false;
	}
}

/**
 * Start-on-boot, registered with the OS (a LaunchAgent on macOS, the Run key on Windows, an
 * autostart .desktop entry on Linux). Survives a power cut, which a browser tab does not.
 */
export async function setAutostart(on: boolean): Promise<void> {
	if (!supported) return;
	try {
		if (on) await enable();
		else await disable();
	} catch (e) {
		console.error('[shell] could not change autostart', e);
	}
}

export async function isAutostartEnabled(): Promise<boolean> {
	if (!supported) return false;
	try {
		return await isEnabled();
	} catch (e) {
		console.error('[shell] could not read autostart state', e);
		return false;
	}
}

/**
 * Read what the OS actually reports, rather than trusting what the kiosk last wrote.
 *
 * These two settings live outside the app: someone can disable the autostart entry in the OS,
 * or the window manager can refuse fullscreen. Showing the app's remembered intention instead
 * of the real state is how a kiosk ends up claiming it will start on boot when it won't.
 */
export async function readShellState(): Promise<{ fullscreen: boolean; autostart: boolean }> {
	const [fullscreen, autostart] = await Promise.all([isFullscreen(), isAutostartEnabled()]);
	return { fullscreen, autostart };
}

<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
		CardFooter
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Camera,
		QrCode,
		Search,
		Check,
		X,
		Plus,
		MapPin as MapPinIcon,
		Maximize,
		Minimize,
		RefreshCcw,
		StopCircle,
		ScanLine,
		Trash2,
		CheckSquare,
		ArrowRight,
		ArrowUp,
		ArrowDown,
		FlipHorizontal,
		Usb,
		PanelRightClose,
		PanelRightOpen
	} from '@lucide/svelte';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { fade, fly } from 'svelte/transition';
	import { dur } from '$lib/utils/motion';
	import { toast } from 'svelte-sonner';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { ScrollArea } from '$lib/components/ui/scroll';
	import { onMount, onDestroy } from 'svelte';
	import { attendanceApi } from '$lib/api/attendance';
	import { supabase } from '$lib/supabase';
	import type { AttendanceEvent } from '$lib/types';
	import { Html5Qrcode } from 'html5-qrcode';
	import { devTools } from '$lib/stores/dev';
	import {
		setupAudioUnlock,
		playAccepted,
		playSuccess,
		playDuplicate,
		playRejected,
		playError
	} from '$lib/utils/beep';
	import { listenForUsbScanner } from '$lib/utils/usbScanner';
	import {
		createScanQueue,
		type ScanOutcome,
		type ScanQueueState,
		type ScanRejection,
		type ScanSource
	} from '$lib/utils/scanQueue';
	import ScanStatusModal from '$lib/components/scan-status-modal.svelte';

	/** How long a result stays up while others are still waiting behind it. */
	const BUSY_RESULT_MS = 1500;

	/** How long a "that scan didn't count" notice stays on the overlay. */
	const REJECTION_NOTICE_MS = 2500;

	type ScanResult = {
		success: boolean;
		message: string;
		member_name?: string;
		care_group?: string;
	};
	import { systemSettings } from '$lib/stores/settings';
	import UsbScannerGuide from '$lib/components/usb-scanner-guide.svelte';
	import { ensureUTC, formatLocalTime, formatTimeRange, formatTimeSync } from '$lib/utils/time';
	import { getErrorMessage, getErrorTitle } from '$lib/utils';
	import { kioskMode } from '$lib/stores/kiosk';
	import { ensureElevated } from '$lib/stores/elevation';
	import ElevationDialog from '$lib/components/elevation-dialog.svelte';
	import { LogOut, Calendar } from '@lucide/svelte';

	// Tooltip state
	let sidebar: any;
	try {
		sidebar = useSidebar();
	} catch (e) {
		console.warn('Sidebar context not found');
	}
	let cameraGuidePosition = $state('top');
	let cameraGuideIdleTime = $state(5);
	let usbScannerEnabled = $state(true);
	// USB scanner mode: camera off, guide on. Entered from the "USB Scanner" button or
	// automatically on the first real scanner burst. Not remembered: each visit starts on the choice screen.
	let usbMode = $state(false);
	let usbScanTick = $state(0);
	// Desktop: hide the right panel (event, manual check-in, recent scans) to widen the scan area
	let isPanelCollapsed = $state(false);
	let isCameraIdle = $state(false);
	let idleSeconds = $state(0);
	let motionCanvas: HTMLCanvasElement;
	let motionCtx: CanvasRenderingContext2D | null = null;
	let movementCheckInterval: ReturnType<typeof setInterval> | null = null;
	let lastFrameData: Uint8ClampedArray | null = null;
	let continuousMovementCount = 0;

	let manualId = $state('');
	let lastScanned = $state<{ id: string; name: string; timestamp: string } | null>(null);
	let isScanning = $state(false); // Controls camera UI visibility
	let activeEvent = $state<AttendanceEvent | null>(null);
	let isLoading = $state(true);

	// -----------------------------------------------------------------------
	// Kiosk standby
	//
	// Shown only when kiosk mode is on AND nothing is currently ongoing - the moment the
	// existing 30s loadActiveEvent() poll (below) finds an ongoing event, activeEvent stops
	// being null and this whole section simply stops rendering; the real scanner underneath
	// was there the entire time, never rebuilt or re-mounted for the transition.
	// -----------------------------------------------------------------------

	/** The event the standby screen counts down to - null once nothing is upcoming either. */
	let nextEvent = $state<AttendanceEvent | null>(null);

	/** Ticks every second so the countdown and clock move without re-querying the database. */
	let kioskNow = $state(new Date());

	let kioskCountdown = $derived.by(() => {
		if (!nextEvent) return null;
		// Database timestamps have no timezone marker but represent UTC - ensureUTC is what
		// every other correct reading of start_datetime in this app already goes through
		// (formatLocalTime does this internally). Skipping it here read a 7:30 AM local
		// event as 11:30 PM - Manila is UTC+8, so the raw string parsed as local time instead
		// of UTC lands 8 hours off, in the direction that pushes morning into the previous
		// night.
		const ms = new Date(ensureUTC(nextEvent.start_datetime)).getTime() - kioskNow.getTime();
		if (ms <= 0) return null;
		const totalSeconds = Math.floor(ms / 1000);
		return {
			hours: Math.floor(totalSeconds / 3600),
			minutes: Math.floor((totalSeconds % 3600) / 60),
			seconds: totalSeconds % 60
		};
	});

	/** nextEvent exists but its start time has already passed - distinct from "nothing
	 *  scheduled" (nextEvent is null) and distinct from an active countdown. A frozen
	 *  00:00:00 reads as broken, the same reasoning that already ruled out showing it for
	 *  "nothing scheduled". This also covers an event stuck on `upcoming` past its start
	 *  time (the automation engine's status job hasn't caught up yet) - the same case, not
	 *  a different one, from what this screen can tell. */
	let kioskEventOverdue = $derived(nextEvent !== null && kioskCountdown === null);

	const pad2 = (n: number) => String(n).padStart(2, '0');

	// Once an overdue event is first observed, re-check for it going ongoing sooner than the
	// routine 30s poll would - a kiosk sitting at "should be live by now" for up to 30
	// extra seconds is the exact moment someone glances over expecting it to have started.
	let overdueRecheckedFor: string | number | null = null;
	$effect(() => {
		if (kioskEventOverdue && nextEvent && overdueRecheckedFor !== nextEvent.event_id) {
			overdueRecheckedFor = nextEvent.event_id;
			void loadActiveEvent(true);
		}
	});

	/** Mirrors loadActiveEvent's own ongoing-vs-none logic rather than sharing state with it:
	 *  the two queries ask different questions (is anything running vs what's coming next) and
	 *  failure in one should not take down the other - the same reasoning the live /attendance
	 *  page already applies between its live session and its Recent Sessions list. */
	async function loadNextEvent() {
		try {
			const upcoming = await attendanceApi.getUpcomingEvents();
			nextEvent = upcoming[0] ?? null;
		} catch (e) {
			console.error('Failed to load next event for kiosk standby:', e);
			// Left as whatever it last was - a stale countdown is a better kiosk-screen failure
			// mode than one that silently reverts to "nothing scheduled" on a network blip.
		}
	}

	/** Gated by elevation, same as every other sensitive action - the kiosk screen is meant
	 *  to be touched by anyone at the table, so leaving it must cost a password. */
	async function exitKioskMode() {
		const granted = await ensureElevated({
			title: 'Exit kiosk mode?',
			description:
				"Confirm the account password to leave kiosk mode and return to normal navigation on this device."
		});
		if (!granted) return;
		kioskMode.setEnabled(false);
		toast.success('Kiosk mode off');
	}

	// Camera State
	let scanner: Html5Qrcode | null = null;
	let cameras: any[] = $state([]);
	let currentCameraIndex = $state(0);
	let isMirrored = $state(false);

	$effect(() => {
		// Auto-detect mirror preference when camera changes
		if (cameras.length > 0 && typeof window !== 'undefined') {
			const label = cameras[currentCameraIndex]?.label.toLowerCase() || '';
			// Automatically treat as front cam (mirrored) unless explicitly labeled as 'back'
			isMirrored = !label.includes('back');
		}
	});

	let isFullscreen = $state(false);
	let scannerContainer: HTMLElement | undefined = $state();
	let scannerContainerDesktop: HTMLElement | undefined = $state();
	let isWideScan = $state(false); // false = Normal (250px), true = Wide (Full)

	/* Recently scanned members in this session */
	let recentScans = $state<{ id: string; name: string; time: string }[]>([]);

	/* Manual Batch Check-in */
	let batchList = $state<{ id: string; name: string }[]>([]);

	/* Batch Selection Mode */
	let isSelectionMode = $state(false);
	let selectedBatchIndices = $state<Set<number>>(new Set());

	/* Search State */
	let searchResults = $state<{ member_id: string; first_name: string; last_name: string }[]>([]);

	// Batch Selection Mode Handlers
	function enterSelectionMode(index: number) {
		isSelectionMode = true;
		selectedBatchIndices = new Set([index]);
	}

	function toggleBatchSelection(index: number) {
		const newSet = new Set(selectedBatchIndices);
		if (newSet.has(index)) {
			newSet.delete(index);
			if (newSet.size === 0) {
				isSelectionMode = false;
			}
		} else {
			newSet.add(index);
		}
		selectedBatchIndices = newSet;
	}

	function exitSelectionMode() {
		isSelectionMode = false;
		selectedBatchIndices = new Set();
	}

	function deleteSelectedMembers() {
		const indices = Array.from(selectedBatchIndices).sort((a, b) => b - a);
		for (const i of indices) {
			batchList.splice(i, 1);
		}
		batchList = batchList;
		exitSelectionMode();
		toast.success(`Removed ${indices.length} member(s)`);
	}

	async function moveSelectedToGroup(newGroupId: string) {
		// This would require a backend call to update member grouping
		// For now, just show a placeholder implementation
		const count = selectedBatchIndices.size;
		toast.success(`Moved ${count} member(s) to selected group`);
		exitSelectionMode();
	}

	onMount(() => {
		setupAudioUnlock();
		if (typeof window !== 'undefined') {
			cameraGuidePosition = localStorage.getItem('cameraGuidePosition') || 'top';
			cameraGuideIdleTime = parseInt(localStorage.getItem('cameraGuideIdleTime') || '5', 10);
			usbScannerEnabled = localStorage.getItem('usbScannerEnabled') !== 'false';
			isPanelCollapsed = localStorage.getItem('scanPanelCollapsed') === 'true';
		}

		// USB QR scanners type the code + Enter like a keyboard; works without the camera.
		// Browsers can't list keyboard-type devices, so the first scan is what detects one.
		const stopUsbScanner = usbScannerEnabled
			? listenForUsbScanner({
					suppressStrayEnter: () => scanState.phase !== 'idle',
					onScan: (code) => {
						// No event: handleScan shows the error; don't switch into USB mode
						if (!usbMode && activeEvent) enterUsbMode();
						usbScanTick++;
						handleScan(code, 'usb');
					}
				})
			: null;

		loadActiveEvent();
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
		window.addEventListener('keydown', handleEscape);

		// Poll for event updates every 30 seconds - kept as a fallback even with the realtime
		// subscription below (see subscribeToEvents), the same belt-and-suspenders the
		// attendance page already uses for its own channel.
		const interval = setInterval(() => loadActiveEvent(true), 30000);

		// Kiosk standby: the next-event query only needs the same 30s cadence as everything
		// else, but the countdown itself has to move every second without a round trip, so
		// it ticks a local clock instead.
		loadNextEvent();
		const nextEventInterval = setInterval(loadNextEvent, 30000);
		const clockInterval = setInterval(() => (kioskNow = new Date()), 1000);

		// Any insert/update/delete on events - a sudden new one created, one starting, one
		// ending - reacts immediately instead of waiting out the rest of the 30s poll. That
		// matters most for an unattended kiosk: it shouldn't sit in standby for half a minute
		// after an event actually starts.
		const unsubscribeEvents = attendanceApi.subscribeToEvents(() => {
			loadActiveEvent(true);
			loadNextEvent();
		});

		return () => {
			clearInterval(interval);
			clearInterval(nextEventInterval);
			clearInterval(clockInterval);
			unsubscribeEvents();
			stopUsbScanner?.();
			// Drops any pending scans and clears the result-hold timer.
			scanQueue.destroy();
			if (rejectionTimer) clearTimeout(rejectionTimer);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
			window.removeEventListener('keydown', handleEscape);
		};
	});

	// True while the app itself leaves fullscreen (Stop, Minimize, switching to USB), so only a
	// user exit (Esc, F11, the browser's exit UI) ends the scan session.
	let exitingFullscreenOnPurpose = false;

	async function exitFullscreenOnPurpose() {
		exitingFullscreenOnPurpose = true;
		try {
			if (document.exitFullscreen) await document.exitFullscreen();
			else (document as any).webkitExitFullscreen?.();
		} catch (e) {
			console.error('Exit fullscreen error:', e);
		} finally {
			setTimeout(() => (exitingFullscreenOnPurpose = false), 100);
		}
	}

	// Single source of truth for isFullscreen, in both directions - not just the explicit
	// "Fullscreen" button's own container.requestFullscreen() call, but enterKioskView's
	// document.documentElement.requestFullscreen() too. Without this, kiosk mode entered the
	// browser's real fullscreen (chrome gone) while the scanner/USB-guide UI stayed in its
	// small bordered card: nothing here ever flipped isFullscreen on, only off, so the
	// fixed-inset-0 full-bleed layout those views switch on never activated.
	function handleFullscreenChange() {
		const inFullscreen = !!(
			document.fullscreenElement || (document as any).webkitFullscreenElement
		);
		isFullscreen = inFullscreen;
		if (!inFullscreen && !exitingFullscreenOnPurpose) endScanSession();
	}

	// In fullscreen the browser uses Esc to exit (handled above); this covers Esc outside fullscreen
	function handleEscape(e: KeyboardEvent) {
		if (e.key !== 'Escape' || document.fullscreenElement) return;
		if (scanState.phase !== 'idle') return;
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		endScanSession();
	}

	// Stop the camera / leave USB mode, exit fullscreen and bring the sidebar back
	function endScanSession() {
		if (!isScanning && !usbMode) return;
		usbMode = false;
		stopScanner();
	}

	async function loadActiveEvent(silent = false) {
		if (!silent) isLoading = true;
		try {
			// Trigger backend status update (Lazy Load approach)
			await attendanceApi.refreshEventStatuses(null);

			// 1. Try Ongoing
			let validEvents = await attendanceApi.getOngoingEvents();

			// If bypass is on and no ongoing events, try to get upcoming or completed events for today
			if ($devTools.bypassEventTimeValidation && (!validEvents || validEvents.length === 0)) {
				const { data: bypassEvents } = await supabase
					.from('events')
					.select('*')
					.order('start_datetime', { ascending: false })
					.limit(1);

				if (bypassEvents && bypassEvents.length > 0) {
					validEvents = bypassEvents as any;
				} else {
					// Mock event if no events exist in DB
					validEvents = [
						{
							event_id: 'mock-dev-event-id',
							event_name: 'Dev Test Event (Bypass Mode)',
							start_datetime: new Date().toISOString(),
							end_datetime: new Date(Date.now() + 86400000).toISOString(),
							status: 'ongoing',
							metadata: { location: 'Test Location' }
						}
					] as any;
				}
			}

			// Check for event transitions
			if (validEvents && validEvents.length > 0) {
				const newEvent = validEvents[0];

				// If we switched events (A -> B), clear local state
				if (activeEvent && activeEvent.event_id !== newEvent.event_id) {
					toast.info(`Event changed to: ${newEvent.event_name}`);
					recentScans = []; // Clear scans
					batchList = []; // Clear manual batch
					manualId = '';
				}

				activeEvent = newEvent;
			} else {
				// No ongoing found.
				// If we previously had an active event, it implies it ended.
				if (activeEvent) {
					toast.warning('Event has ended.');
					recentScans = [];
					batchList = [];
					activeEvent = null;
					// Without this the camera (or USB listener) kept running pointed at an
					// event that no longer exists - every scan silently fell into
					// processScan's "No active event found to scan into" branch instead of
					// the page visibly returning to standby/no-event state.
					if (isScanning) void stopCameraFeed();
					usbMode = false;
				}
			}
		} catch (e) {
			console.error(e);
			if (!silent) toast.error('Failed to load active event');
		} finally {
			if (!silent) isLoading = false;
		}
	}

	function getQrBoxConfig() {
		if (typeof window === 'undefined') return { width: 250, height: 250 };

		if (isWideScan) {
			// Wide Mode: ~85% of screen width, rectangular-ish but large
			// This mimics "taking almost the whole camera"
			const w = Math.min(window.innerWidth * 0.85, 600);
			const h = Math.min(window.innerHeight * 0.6, 400); // Taller than typical rect
			return { width: Math.floor(w), height: Math.floor(h) };
		}
		// Normal Mode
		return { width: 250, height: 250 };
	}

	// Collapse the sidebar on desktop and put the whole browser window in fullscreen.
	// Must run from a user gesture (click, or a scanner keystroke) or the browser refuses.
	function enterKioskView() {
		if (typeof window !== 'undefined' && window.innerWidth >= 768 && sidebar && sidebar.open) {
			sidebar.setOpen(false);
		}

		if (typeof document !== 'undefined' && document.documentElement) {
			try {
				if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
					if (document.documentElement.requestFullscreen) {
						document.documentElement.requestFullscreen().catch(() => {});
					} else if ((document.documentElement as any).webkitRequestFullscreen) {
						(document.documentElement as any).webkitRequestFullscreen();
					}
				}
			} catch (err) {
				console.error('Browser fullscreen request failed', err);
			}
		}
	}

	async function startScanner() {
		if (!activeEvent) {
			toast.error('No active event! Cannot start scanner.');
			return;
		}

		enterKioskView();

		isScanning = true;
		// Wait for DOM to render the #reader div
		setTimeout(async () => {
			try {
				const elementId = window.innerWidth >= 768 ? 'reader-desktop' : 'reader-mobile';
				if (!scanner) {
					// verbose: false
					scanner = new Html5Qrcode(elementId, false);
				}
				const devices = await Html5Qrcode.getCameras();
				if (devices && devices.length) {
					cameras = devices;

					const backCam = cameras.find((c) => c.label.toLowerCase().includes('back')) || cameras[0];
					currentCameraIndex = cameras.indexOf(backCam);

					await scanner.start(
						backCam.id,
						{
							fps: 10,
							qrbox: getQrBoxConfig()
							// aspectRatio: 1.0
						},
						(decodedText) => {
							// Handle scan success
							// Basic debounce/duplicate check is handled in handleScan's logic via toast or backend
							handleScan(decodedText);
						},
						(errorMessage) => {
							// ignore frame read errors
						}
					);
				} else {
					const msg = getErrorMessage({ message: 'No cameras found on device.' });
					toast.error(msg);
					isScanning = false;
				}
			} catch (err) {
				console.error(err);
				const msg = getErrorMessage(err);
				const title = getErrorTitle(err);
				toast.error(`${title}: ${msg}`);
				isScanning = false;
			}
		}, 100);
	}

	async function stopScanner() {
		if (typeof document !== 'undefined' && document.fullscreenElement) {
			await exitFullscreenOnPurpose();
		}

		// Restore sidebar for desktop
		if (typeof window !== 'undefined' && window.innerWidth >= 768 && sidebar && !sidebar.open) {
			sidebar.setOpen(true);
		}

		if (scanner) {
			try {
				if (scanner.isScanning) {
					await scanner.stop();
					await scanner.clear();
				}
			} catch (e) {
				console.error('Error stopping scanner:', e);
			}
		}
		isScanning = false;
	}

	function useUsbScanner() {
		if (!activeEvent) {
			toast.error('No active event! Cannot start scanner.');
			return;
		}
		enterKioskView();
		usbMode = true;
		if (isScanning) stopCameraFeed();
	}

	function enterUsbMode() {
		if (isScanning) toast.success('USB scanner detected — camera turned off');
		useUsbScanner();
	}

	function useCameraInstead() {
		usbMode = false;
		startScanner();
	}

	function togglePanel() {
		isPanelCollapsed = !isPanelCollapsed;
		localStorage.setItem('scanPanelCollapsed', String(isPanelCollapsed));

		// After the width transition: the camera's scan box is sized in px at start, so restart it;
		// when re-opening, jump straight to the search box for manual check-in.
		const opened = !isPanelCollapsed;
		setTimeout(() => {
			restartCameraFeed();
			if (opened) document.getElementById('memberIdDesktop')?.focus();
		}, 250);
	}

	async function restartCameraFeed() {
		if (!scanner?.isScanning) return;
		try {
			await scanner.stop();
			await scanner.start(
				cameras[currentCameraIndex].id,
				{ fps: 10, qrbox: getQrBoxConfig() },
				(decodedText) => handleScan(decodedText),
				() => {}
			);
		} catch (e) {
			console.error('Camera restart failed:', e);
		}
	}

	// Unlike stopScanner, keeps the page in browser fullscreen (kiosk) and the sidebar collapsed
	async function stopCameraFeed() {
		if (isFullscreen) {
			await exitFullscreenOnPurpose();
			isFullscreen = false;
		}
		if (scanner?.isScanning) {
			try {
				await scanner.stop();
				await scanner.clear();
			} catch (e) {
				console.error('Error stopping scanner:', e);
			}
		}
		isScanning = false;
	}

	async function switchCamera() {
		if (!scanner || !scanner.isScanning) return;

		try {
			await scanner.stop();
			await scanner.clear();

			currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
			const nextCamera = cameras[currentCameraIndex];

			console.log(`Switching to camera: ${nextCamera.label}`);

			// Restart with new camera
			await scanner.start(
				nextCamera.id,
				{ fps: 10, qrbox: getQrBoxConfig() },
				(decodedText) => handleScan(decodedText),
				() => {}
			);

			toast.success(`Switched to ${nextCamera.label}`);
		} catch (err) {
			console.error('Camera switch failed:', err);
			const msg = getErrorMessage(err);
			const title = getErrorTitle(err);
			toast.error(`${title}: ${msg}`);

			// Try to restart the original camera
			try {
				if (scanner) {
					await scanner.start(
						cameras[currentCameraIndex].id,
						{ fps: 10, qrbox: getQrBoxConfig() },
						(decodedText) => handleScan(decodedText),
						() => {}
					);
				}
			} catch (retryErr) {
				console.error('Failed to recover camera:', retryErr);
				const fallbackMsg = getErrorMessage(retryErr);
				toast.error(`Camera unavailable: ${fallbackMsg}`);
			}
		}
	}

	function toggleFullscreen() {
		const container = window.innerWidth >= 768 ? scannerContainerDesktop : scannerContainer;
		if (!container) return;

		if (!isFullscreen) {
			try {
				if (container.requestFullscreen) {
					container.requestFullscreen();
				} else if ((container as any).webkitRequestFullscreen) {
					(container as any).webkitRequestFullscreen();
				}
				isFullscreen = true;

				// Restart camera after fullscreen transition with delay
				setTimeout(async () => {
					try {
						if (scanner && isScanning) {
							// Stop and reinitialize scanner
							await scanner.stop();
							await scanner.clear();

							// Restart with a small delay to allow fullscreen to settle
							await new Promise((resolve) => setTimeout(resolve, 300));

							await scanner.start(
								cameras[currentCameraIndex].id,
								{ fps: 10, qrbox: getQrBoxConfig() },
								(decodedText) => handleScan(decodedText),
								() => {}
							);

							toast.success('Camera restarted in fullscreen mode');
						}
					} catch (err) {
						console.error('Failed to restart camera in fullscreen:', err);
						const msg = getErrorMessage(err);
						const title = getErrorTitle(err);
						toast.error(`${title}: ${msg}`);
					}
				}, 100);
			} catch (err) {
				console.error('Fullscreen error:', err);
				const msg = getErrorMessage(err);
				const title = getErrorTitle(err);
				toast.error(`${title}: ${msg}`);
			}
		} else {
			exitFullscreenOnPurpose();
			isFullscreen = false;
		}
	}

	/**
	 * Performs one check-in. Runs inside the scan queue, one at a time, so it never has to
	 * guard against concurrency itself.
	 */
	async function processScan(id: string, _source: ScanSource): Promise<ScanOutcome> {
		if (!activeEvent) {
			return { phase: 'error', memberId: id, message: 'No active event found to scan into.' };
		}

		try {
			let result: ScanResult;
			if ($devTools.bypassEventTimeValidation) {
				// Mock API response if bypass is active to avoid database writes
				result = {
					success: true,
					message: 'Mock scan success',
					member_name: 'Test Member',
					care_group: 'Test Group'
				};
			} else {
				// Perform atomic Scan using server RPC
				result = await attendanceApi.scanMember(id, activeEvent.event_id, null);
			}

			if (!result.success) {
				const isDuplicate = result.message?.includes('Already');
				if (isDuplicate) {
					playDuplicate();
					return {
						phase: 'duplicate',
						memberName: result.member_name || 'Member',
						memberId: id,
						message: result.message
					};
				}

				playError();
				return { phase: 'error', memberId: id, message: result.message };
			}

			playSuccess();

			// Formatted from the already-loaded settings store rather than the async helper,
			// which can fall back to a system_settings query and add a round-trip here.
			const time = formatTimeSync(new Date());
			const fullName = result.member_name || 'Member';
			const groupName = result.care_group || 'N/A';

			lastScanned = { id, name: fullName, timestamp: time };

			if (!recentScans.find((scan) => scan.id === id)) {
				recentScans = [{ id, name: fullName, time }, ...recentScans];
			}

			manualId = ''; // Clear input

			return {
				phase: 'success',
				memberName: fullName,
				memberId: id,
				careGroup: groupName,
				time
			};
		} catch (e: any) {
			console.error(e);
			playError();
			const msg = getErrorMessage(e);
			const title = getErrorTitle(e);

			if (e?.message?.includes('duplicate')) {
				return { phase: 'duplicate', memberId: id, message: msg };
			}
			return { phase: 'error', memberId: id, message: `${title}: ${msg}` };
		}
	}

	const scanQueue = createScanQueue({
		process: processScan,
		// Keep the line moving when people are waiting, but give a relaxed desk the full
		// configured time to read the confirmation.
		resultHoldMs: (depth) =>
			depth > 0 ? BUSY_RESULT_MS : ($systemSettings.scanModalDuration ?? 5) * 1000
	});

	let scanState = $state<ScanQueueState>({
		phase: 'idle',
		currentCode: null,
		currentSource: null,
		outcome: null,
		queueDepth: 0
	});

	$effect(() => {
		const unsubscribe = scanQueue.subscribe((value) => {
			scanState = value;
		});
		return unsubscribe;
	});

	/**
	 * A scan the queue turned away.
	 *
	 * Deliberately not a toast. A toast is small, cornered and easy to miss over the scanner's
	 * own beep, which is the precise confusion this overlay exists to remove - a rejected scan
	 * has to be as loud as a successful one, or someone walks away thinking it counted.
	 */
	let rejection = $state<ScanRejection | null>(null);
	let rejectionTimer: ReturnType<typeof setTimeout> | null = null;

	function showRejection(kind: ScanRejection['kind']) {
		if (rejectionTimer) clearTimeout(rejectionTimer);
		rejection = { kind };
		rejectionTimer = setTimeout(() => {
			rejection = null;
			rejectionTimer = null;
		}, REJECTION_NOTICE_MS);
	}

	function clearRejection() {
		if (rejectionTimer) clearTimeout(rejectionTimer);
		rejectionTimer = null;
		rejection = null;
	}

	/** Dismissing the overlay clears both the held result and any rejection notice on it. */
	function dismissOverlay() {
		clearRejection();
		scanQueue.dismissResult();
	}

	// When result detail is switched off the overlay only covers the processing phase, so the
	// outcome still has to be announced somehow - fall back to the toasts used before.
	$effect(() => {
		if ($systemSettings.scanModalEnabled) return;
		const outcome = scanState.outcome;
		if (!outcome) return;

		if (outcome.phase === 'success') {
			toast.success(`Checked in ${outcome.memberName}`, { id: 'scan-result' });
		} else if (outcome.phase === 'duplicate') {
			toast.info(`${outcome.memberName || outcome.memberId} is already checked in.`, {
				id: 'scan-result'
			});
		} else {
			toast.error(outcome.message || 'Check-in failed', { id: 'scan-result' });
		}
	});

	/**
	 * Single entry point for every scan source, which is what keeps USB, camera and manual
	 * behaving identically. Returns nothing - feedback is immediate and audible.
	 */
	function handleScan(id: string, source: ScanSource = 'camera') {
		if (!id) return;

		if (!activeEvent) {
			playError();
			toast.error('No active event found to scan into.');
			return;
		}

		const result = scanQueue.submit(id, source);

		if (result === 'queued') {
			// Fires before any network work: the app's own "I have you", distinct from the
			// scanner's hardware beep, which only ever meant "I read the barcode".
			playAccepted();
			return;
		}

		// A camera sees the same QR ~10x a second, so every frame after a scan comes back as a
		// duplicate. Those are not deliberate actions - buzzing and flashing a notice at each one
		// would be a continuous alarm. Queue-full is different even from a camera: a real scan
		// was dropped, so that one still gets announced.
		if (source === 'camera' && result === 'duplicate-ignored') return;

		playRejected();
		showRejection(result === 'rejected-full' ? 'full' : 'duplicate');
	}

	async function handleSearch(e: Event) {
		const query = (e.target as HTMLInputElement).value;
		manualId = query;

		if (!query || query.length < 2) {
			searchResults = [];
			return;
		}

		const { data, error } = await supabase
			.from('members')
			.select('member_id, first_name, last_name')
			.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,member_id.ilike.%${query}%`)
			.limit(5);

		if (data && activeEvent) {
			// Filter out already checked-in members to avoid duplication
			const memberIds = data.map((m) => m.member_id);

			const [{ data: scanned }, { data: present }] = await Promise.all([
				supabase
					.from('attendance_scans')
					.select('member_id')
					.eq('event_id', activeEvent.event_id)
					.in('member_id', memberIds),
				supabase
					.from('attendance_present')
					.select('member_id')
					.eq('event_id', activeEvent.event_id)
					.in('member_id', memberIds)
			]);

			const checkedInIds = new Set([
				...(scanned?.map((s) => s.member_id) || []),
				...(present?.map((s) => s.member_id) || [])
			]);

			// Filter out checked in AND already in batch list
			searchResults = data.filter(
				(m) => !checkedInIds.has(m.member_id) && !batchList.find((b) => b.id === m.member_id)
			);
		} else if (data) {
			searchResults = data;
		}
	}

	// The pending batch list + Save button only exist in the mobile layout
	function isDesktopLayout() {
		return typeof window !== 'undefined' && window.innerWidth >= 768;
	}

	function selectMember(member: { member_id: string; first_name: string; last_name: string }) {
		searchResults = [];
		manualId = '';
		if (isDesktopLayout()) {
			handleScan(member.member_id, 'manual');
		} else {
			addToBatch(member.member_id, `${member.first_name} ${member.last_name}`);
		}
	}

	async function addToBatch(id: string, name?: string) {
		if (!id) return;

		// Deduplicate locally
		if (batchList.find((b) => b.id === id)) {
			toast.info(`${name || id} is already in the list`);
			return;
		}

		// Deduplicate against server (Already Checked In)
		if (activeEvent) {
			const isDuplicate = await attendanceApi.isAlreadyScanned(id, activeEvent.event_id);

			if (isDuplicate) {
				toast.error(`${name || id} is already checked in.`);
				return;
			}
		}

		// Validate and Fetch Member Name
		let memberName = name;
		if (!memberName) {
			const { data, error } = await supabase
				.from('members')
				.select('first_name, last_name')
				.eq('member_id', id)
				.single();

			if (error || !data) {
				toast.error(`Member not found with ID: ${id}`);
				return;
			}

			memberName = `${data.first_name} ${data.last_name}`;
		}

		batchList = [...batchList, { id, name: memberName }];
	}

	function removeFromBatch(index: number) {
		batchList = batchList.filter((_, i) => i !== index);
	}

	async function submitBatch() {
		if (batchList.length === 0 || !activeEvent) return;

		const toastId = toast.loading(`Checking in ${batchList.length} members...`);
		let successCount = 0;

		for (const m of batchList) {
			try {
				if ($devTools.bypassEventTimeValidation) {
					// Mock success without writing to DB
					successCount++;
				} else {
					await attendanceApi.scanMember(m.id, activeEvent.event_id, null);
					successCount++;
				}

				// Add to recent scans for record
				const time = await formatLocalTime(new Date().toISOString());
				// Add to local list if not already there
				if (!recentScans.find((s) => s.id === m.id)) {
					recentScans = [{ id: m.id, name: m.name, time }, ...recentScans];
				}
			} catch (e: any) {
				console.error(`Failed to scan ${m.name}`, e);
			}
		}

		// The shared vocabulary, not a hand-rolled copy of it: this was literally
		// playSuccess() inlined, which meant the batch path kept the old tone when the
		// vocabulary was retuned.
		playSuccess();

		toast.success(`Successfully checked in ${successCount} members`, { id: toastId });
		batchList = []; // Clear
	}

	function handleManualSubmit() {
		const id = manualId.trim();
		if (!id) return;
		if (isDesktopLayout()) {
			// Desktop checks in right away; a typed name resolves to its single search match
			const target = searchResults.length === 1 ? searchResults[0].member_id : id;
			searchResults = [];
			manualId = '';
			handleScan(target, 'manual');
		} else {
			// Mobile: add to the list, saved with "Save Attendance"
			addToBatch(id);
		}
	}

	function toggleCamera() {
		if (isScanning) {
			stopScanner();
		} else {
			startScanner();
		}
	}

	async function toggleScanSize() {
		if (!scanner) return;
		isWideScan = !isWideScan;

		// Need to restart scanner to apply new qrbox size
		if (scanner.isScanning) {
			try {
				await scanner.stop();
				await scanner.start(
					cameras[currentCameraIndex].id,
					{
						fps: 10,
						qrbox: getQrBoxConfig()
					},
					(decodedText) => handleScan(decodedText),
					() => {}
				);
				const mode = isWideScan ? 'Wide' : 'Normal';
				toast.success(`Scan size set to ${mode}`);
			} catch (e) {
				console.error(e);
				toast.error('Failed to update scan size');
			}
		}
	}

	/* Event Session Display */
	let session = $state<any>(null);

	$effect(() => {
		if (activeEvent) {
			(async () => {
				session = {
					title: activeEvent.event_name,
					location: (activeEvent.metadata as any)?.location || 'Main Sanctuary',
					timeStart: await formatLocalTime(activeEvent.start_datetime),
					timeEnd: await formatLocalTime(activeEvent.end_datetime),
					isActive: activeEvent.status === 'ongoing'
				};
			})();
		} else {
			session = null;
		}
	});

	// Toggle a class on <body> to hide the mobile nav when items are selected (use $effect in runes mode)
	// Updated: Hide nav if Pending Batch List > 0 OR Fullscreen OR in Selection Mode
	$effect(() => {
		if (typeof document === 'undefined') return;

		if (batchList.length > 0 || isFullscreen || isSelectionMode) {
			document.body.classList.add('hide-mobile-nav');
		} else {
			document.body.classList.remove('hide-mobile-nav');
		}
		return () => {
			if (typeof document !== 'undefined') document.body.classList.remove('hide-mobile-nav');
		};
	});

	onDestroy(() => {
		if (scanner) {
			try {
				if (scanner.isScanning) {
					scanner.stop().catch(console.error);
				}
				scanner.clear();
			} catch (e) {
				console.error(e);
			}
		}
		if (typeof document !== 'undefined') document.body.classList.remove('hide-mobile-nav');
	});

	// Camera Idle Detection Effect
	$effect(() => {
		if (
			isScanning &&
			cameraGuidePosition !== 'off' &&
			typeof window !== 'undefined' &&
			window.innerWidth >= 768
		) {
			if (!motionCanvas) {
				motionCanvas = document.createElement('canvas');
				motionCanvas.width = 32;
				motionCanvas.height = 32;
				motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
			}

			movementCheckInterval = setInterval(() => {
				const video = document.querySelector('#reader-desktop video') as HTMLVideoElement;
				if (!video || !motionCtx || video.readyState < 2) return;

				try {
					motionCtx.drawImage(video, 0, 0, 32, 32);
					const currentFrame = motionCtx.getImageData(0, 0, 32, 32).data;

					if (lastFrameData) {
						let diffCount = 0;
						for (let i = 0; i < currentFrame.length; i += 4) {
							const diff =
								Math.abs(currentFrame[i] - lastFrameData[i]) +
								Math.abs(currentFrame[i + 1] - lastFrameData[i + 1]) +
								Math.abs(currentFrame[i + 2] - lastFrameData[i + 2]);
							// Threshold for visual change (reduces noise)
							if (diff > 60) diffCount++;
						}

						// If less than 50 pixels changed significantly, consider it idle
						if (diffCount < 50) {
							idleSeconds += 0.5;
							continuousMovementCount = 0;
						} else {
							idleSeconds = 0;
							continuousMovementCount++;
							// Require 1.5 seconds (3 intervals) of continuous movement to hide the guide
							if (continuousMovementCount >= 3) {
								isCameraIdle = false;
							}
						}

						if (idleSeconds >= cameraGuideIdleTime) {
							isCameraIdle = true;
						}
					}

					lastFrameData = new Uint8ClampedArray(currentFrame);
				} catch (e) {
					// Ignore cross-origin canvas errors or video ready errors
				}
			}, 500);
		} else {
			if (movementCheckInterval) clearInterval(movementCheckInterval);
			isCameraIdle = false;
			idleSeconds = 0;
		}

		return () => {
			if (movementCheckInterval) clearInterval(movementCheckInterval);
		};
	});
</script>

<svelte:head>
	<title>Scan | {siteConfig.name}</title>
</svelte:head>

<!-- Mobile View -->
<div class="flex flex-1 flex-col gap-6 p-4 pb-24 md:hidden">
	<!-- Active Event Info (Mobile) -->
	{#if session}
		<div class="rounded-xl border border-primary/20 bg-primary/10 p-4">
			<h3 class="font-bold text-primary">{session.title}</h3>
			<div class="mt-1 flex gap-2 text-xs text-muted-foreground">
				<span>{session.timeStart} - {session.timeEnd}</span>
				<span>•</span>
				<span>{session.location}</span>
			</div>
			{#if !session.isActive}
				<div class="mt-2 text-xs font-bold text-amber-500">Not currently active</div>
			{/if}
		</div>
	{:else if isLoading}
		<div class="p-4 text-center text-muted-foreground">Loading event...</div>
	{:else}
		<div
			class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center font-bold text-destructive"
		>
			No Active Event Found
		</div>
	{/if}

	<!-- Camera Scan card -->
	<div
		bind:this={scannerContainer}
		class={isFullscreen
			? // See the desktop container for why this isn't unconditionally bg-black.
				`fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-visible ${isScanning ? 'bg-black' : 'bg-background'}`
			: 'relative flex min-h-0 flex-1 flex-col justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border/40'}
	>
		{#if usbMode && !isScanning}
			<UsbScannerGuide
				compact
				connected={usbScanTick > 0}
				scanTick={usbScanTick}
				{lastScanned}
				onUseCamera={useCameraInstead}
			/>
		{:else if !isScanning}
			<div class="flex flex-col items-center gap-6 p-6">
				<div class="rounded-lg border border-border/20 bg-card/20 p-6">
					<Camera class="h-10 w-10 text-primary" />
				</div>
				<div class="text-center">
					<p class="font-bold text-foreground">Ready to Scan</p>
					<p class="mt-2 text-xs text-muted-foreground">
						Point your camera at the member's QR code
					</p>
				</div>
				<Button
					class="mt-3 h-12 w-56 rounded-2xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20"
					onclick={toggleCamera}
				>
					<QrCode class="mr-2 h-4 w-4" /> Start Camera
				</Button>
				{#if usbScannerEnabled}
					<Button
						variant="outline"
						class="-mt-3 h-12 w-56 rounded-2xl font-bold"
						onclick={useUsbScanner}
					>
						<Usb class="mr-2 h-4 w-4" /> Use USB Scanner
					</Button>
				{/if}
			</div>
		{:else}
			<!-- Scanner UI -->
			<div
				id="reader-mobile"
				class="h-full w-full bg-black {isMirrored ? 'mirror-camera' : ''}"
			></div>

			<!-- Controls Overlay -->
			<div class="scan-controls absolute right-0 bottom-8 left-0 z-10 flex justify-center gap-4">
				<Button
					variant="outline"
					size="icon"
					class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
					onclick={() => (isMirrored = !isMirrored)}
					title="Mirror Camera"
				>
					<FlipHorizontal class="h-5 w-5" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
					onclick={switchCamera}
				>
					<RefreshCcw class="h-5 w-5" />
				</Button>
				{#if usbScannerEnabled}
					<Button
						variant="outline"
						size="icon"
						class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
						onclick={useUsbScanner}
						title="Use USB Scanner"
						aria-label="Use USB Scanner"
					>
						<Usb class="h-5 w-5" />
					</Button>
				{/if}
				<Button
					variant="destructive"
					size="icon"
					class="h-10 w-10 rounded-xl"
					onclick={stopScanner}
				>
					<StopCircle class="h-5 w-5" />
				</Button>
				{#if isFullscreen}
					<Button
						variant="outline"
						size="icon"
						class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
						onclick={toggleScanSize}
					>
						<ScanLine class="h-5 w-5" />
					</Button>
				{/if}
				<Button
					variant="outline"
					size="icon"
					class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
					onclick={toggleFullscreen}
				>
					{#if isFullscreen}
						<Minimize class="h-5 w-5" />
					{:else}
						<Maximize class="h-5 w-5" />
					{/if}
				</Button>
			</div>

			<!-- Overlay Text helper -->
			<div class="pointer-events-none absolute top-4 right-0 left-0 z-10 text-center">
				<div
					class="inline-block rounded-full border border-white/10 bg-black/50 px-4 py-2 text-xs font-medium text-white backdrop-blur"
				>
					Scan QR Code
				</div>
			</div>

			<!-- Rendered inside the fullscreen container: a fullscreen element covers everything
			     else on the page, so a modal outside it would be invisible. -->
			{#if isFullscreen}
				<ScanStatusModal
					state={scanState}
					showResultDetail={$systemSettings.scanModalEnabled}
					resultDuration={scanState.queueDepth > 0
						? BUSY_RESULT_MS
						: ($systemSettings.scanModalDuration ?? 5) * 1000}
					{rejection}
					onDismiss={dismissOverlay}
				/>
			{/if}
		{/if}
	</div>

	<!-- OR divider -->
	<div class="flex items-center gap-3">
		<div class="h-px flex-1 bg-border"></div>
		<div class="text-xs tracking-[0.12em] text-muted-foreground uppercase">Or manual</div>
		<div class="h-px flex-1 bg-border"></div>
	</div>

	<!-- Manual Entry -->
	<div>
		<h3 class="mb-3 text-sm font-bold tracking-wider text-muted-foreground uppercase">
			Manual Check-In
		</h3>
		<div class="relative z-20 flex items-center gap-2">
			<div class="relative flex-1">
				<Search class="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground/60" />
				<input
					type="text"
					placeholder="Search name or ID..."
					value={manualId}
					oninput={handleSearch}
					onkeydown={(e) => e.key === 'Enter' && handleManualSubmit()}
					class="w-full rounded-2xl border border-border/20 bg-card/20 py-4 pr-4 pl-12 text-sm placeholder-muted-foreground-mobile"
				/>

				{#if searchResults.length > 0}
					<div
						class="absolute top-full right-0 left-0 z-30 mt-2 overflow-hidden rounded-xl border border-border bg-background shadow-xl"
					>
						{#each searchResults as member}
							<button
								class="flex w-full flex-col border-b border-border/50 px-4 py-3 text-left last:border-0 hover:bg-muted/50"
								onclick={() => selectMember(member)}
							>
								<span class="text-sm font-bold">{member.first_name} {member.last_name}</span>
								<span class="font-mono text-xs text-muted-foreground">{member.member_id}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<Button
				class="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary) p-0 text-(--color-primary-foreground)"
				onclick={handleManualSubmit}
				aria-label="Add"
				disabled={!manualId}
			>
				<Plus class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Batch List (Mobile) - Inline Flow -->
	{#if batchList.length > 0}
		<div class="mt-4 mb-28 space-y-3">
			<div class="flex items-center justify-between px-1">
				<div class="text-xs font-black tracking-widest text-muted-foreground uppercase">
					{#if isSelectionMode}
						SELECTED ({selectedBatchIndices.size})
					{:else}
						SELECTED ({batchList.length})
					{/if}
				</div>
				<div class="flex items-center gap-2">
					{#if isSelectionMode}
						<button
							class="rounded p-1 transition-colors hover:bg-muted"
							onclick={exitSelectionMode}
							aria-label="Exit selection mode"
						>
							<X class="h-4 w-4 text-muted-foreground" />
						</button>
					{:else}
						<button
							class="text-xs font-bold text-primary transition-colors hover:text-primary/80"
							onclick={() => (batchList = [])}>Clear all</button
						>
					{/if}
				</div>
			</div>

			<div class="flex flex-col gap-2">
				{#each batchList as item, i}
					<div
						class="group relative flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-all select-none {isSelectionMode &&
						selectedBatchIndices.has(i)
							? 'border-primary bg-primary/5'
							: 'border-border/40 bg-card/50 hover:border-border/60'}"
						role="button"
						tabindex="0"
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (isSelectionMode) {
									toggleBatchSelection(i);
								} else {
									enterSelectionMode(i);
									toast.success('Selection mode activated. Long-press to select/deselect.');
									if (navigator.vibrate) {
										navigator.vibrate([50, 100, 50]);
									}
								}
							}
						}}
						oncontextmenu={(e) => {
							e.preventDefault();
							console.log(
								'Context menu / long-press on item',
								i,
								'isSelectionMode:',
								isSelectionMode
							);
							if (isSelectionMode) {
								// In selection mode, toggle the selection
								toggleBatchSelection(i);
								console.log('Selection toggled for item', i);
							} else {
								// Not in selection mode, activate it
								console.log('Activating selection mode for item', i);
								enterSelectionMode(i);
								toast.success('Selection mode activated. Long-press to select/deselect.');
								// Haptic feedback
								if (navigator.vibrate) {
									navigator.vibrate([50, 100, 50]);
								}
							}
						}}
						onclick={(e) => {
							console.log('Click on item', i, 'isSelectionMode:', isSelectionMode);
							if (isSelectionMode) {
								e.stopPropagation();
								toggleBatchSelection(i);
								console.log('Selection toggled for item', i);
							}
						}}
					>
						{#if isSelectionMode}
							<div
								class="pointer-events-none flex h-5 w-5 items-center justify-center rounded border-2 {selectedBatchIndices.has(
									i
								)
									? 'border-primary bg-primary'
									: 'border-muted-foreground/30 bg-transparent'}"
							>
								{#if selectedBatchIndices.has(i)}
									<Check class="h-4 w-4 text-white" />
								{/if}
							</div>
						{/if}

						<Avatar
							class="pointer-events-none h-10 w-10 border border-border/20 {isSelectionMode
								? 'opacity-75'
								: ''}"
						>
							<AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${item.name}`} />
							<AvatarFallback class="bg-primary/20 text-xs font-bold text-primary"
								>{item.name.substring(0, 2).toUpperCase()}</AvatarFallback
							>
						</Avatar>

						<div class="pointer-events-none min-w-0 flex-1">
							<div class="truncate text-sm font-bold text-foreground">{item.name}</div>
							<div class="font-mono text-xs text-muted-foreground">ID: {item.id}</div>
						</div>

						{#if !isSelectionMode}
							<button
								class="hover:text-destructive-foreground flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors hover:bg-destructive"
								onclick={() => removeFromBatch(i)}
							>
								<X class="h-4 w-4" />
							</button>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Selection Mode Action Buttons -->
			{#if isSelectionMode && selectedBatchIndices.size > 0}
				<div class="flex gap-2 pt-2">
					<Button variant="destructive" size="sm" class="flex-1" onclick={deleteSelectedMembers}>
						<X class="mr-1 h-4 w-4" /> Delete ({selectedBatchIndices.size})
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="flex-1"
						onclick={() => {
							// TODO: Show group selection modal
							toast.info('Group assignment feature coming soon');
						}}
					>
						<MapPinIcon class="mr-1 h-4 w-4" /> Move Group
					</Button>
				</div>
			{/if}
		</div>

		<!-- Floating Save Button -->
		<div
			class="fixed right-0 bottom-0 left-0 z-50 rounded-t-3xl border-t border-border/20 bg-background/95 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl"
		>
			<Button
				size="lg"
				class="h-14 w-full rounded-2xl text-base font-bold shadow-lg shadow-primary/20"
				onclick={submitBatch}
			>
				Save Attendance ({batchList.length}) <ArrowRight class="ml-2 h-5 w-5" />
			</Button>
		</div>
	{/if}

	<!-- Recent Scans list (Hidden on mobile if user requested, or kept? User said 'no recent scans') -->
	<!-- Removed Recent Scans from Mobile View per request -->
</div>

<!-- Desktop View -->
<div
	class="relative hidden w-full grid-rows-[minmax(0,1fr)] p-6 transition-[grid-template-columns,column-gap] duration-200 ease-out motion-reduce:transition-none md:grid lg:p-8 {$kioskMode.enabled
		? 'h-screen'
		: 'h-[calc(100vh-100px)]'} {isPanelCollapsed
		? 'grid-cols-[minmax(0,1fr)_minmax(0,0fr)] gap-x-0'
		: 'grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-x-6'}"
>
	<!-- Left Column: Scanner -->
	<div class="flex h-full min-h-0 min-w-0 flex-col gap-6">
		<!-- Scanner Area -->
		<div
			bind:this={scannerContainerDesktop}
			class={isFullscreen
				? // bg-black only while the camera feed itself is filling this - it's the feed's
					// backdrop, not a page background. The USB guide and "Ready to Scan" idle state
					// use normal theme-token text/cards (not styled for literal black), so forcing
					// black behind them here made kiosk's resting state unreadable - the camera is
					// off far more of the time than it's on.
					`fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-visible ${isScanning ? 'bg-black' : 'bg-background'}`
				: `relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-(--stat-success)/20 bg-card/5 ${isScanning ? 'border-0 p-0' : 'p-16'}`}
		>
			{#if isScanning}
				<div
					id="reader-desktop"
					class="h-full w-full bg-black {isMirrored ? 'mirror-camera' : ''}"
				></div>
				<div class="absolute right-0 bottom-6 left-0 z-10 flex justify-center gap-4">
					<Button
						variant="destructive"
						size="lg"
						class="rounded-full shadow-xl"
						onclick={stopScanner}
					>
						<StopCircle class="mr-2 h-5 w-5" /> Stop Scanning
					</Button>
					<Button
						variant="outline"
						size="icon"
						class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
						onclick={() => (isMirrored = !isMirrored)}
						title="Mirror Camera"
					>
						<FlipHorizontal class="h-5 w-5" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
						onclick={toggleScanSize}
					>
						<ScanLine class="h-5 w-5" />
					</Button>
					{#if usbScannerEnabled}
						<Button
							variant="outline"
							size="icon"
							class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
							onclick={useUsbScanner}
							title="Use USB Scanner"
							aria-label="Use USB Scanner"
						>
							<Usb class="h-5 w-5" />
						</Button>
					{/if}
					<Button
						variant="outline"
						size="icon"
						class="h-10 w-10 rounded-xl border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-white/20"
						onclick={toggleFullscreen}
						title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
					>
						{#if isFullscreen}
							<Minimize class="h-5 w-5" />
						{:else}
							<Maximize class="h-5 w-5" />
						{/if}
					</Button>
				</div>

				<!-- Desktop Camera Guide Tooltip -->
				{#if (isCameraIdle || cameraGuideIdleTime === 0) && cameraGuidePosition !== 'off'}
					<div
						transition:fly={{ y: cameraGuidePosition === 'top' ? -20 : 20, duration: 300 }}
						class="pointer-events-none fixed left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 {cameraGuidePosition ===
						'top'
							? 'top-4'
							: 'bottom-8'}"
					>
						{#if cameraGuidePosition === 'top'}
							<ArrowUp class="h-8 w-8 animate-bounce text-primary drop-shadow-md" />
						{/if}
						<div
							class="rounded-full bg-primary/90 px-6 py-3 text-sm font-bold text-white shadow-xl ring-2 ring-white/20 backdrop-blur"
						>
							Show your QR code here
						</div>
						{#if cameraGuidePosition === 'bottom'}
							<ArrowDown class="h-8 w-8 animate-bounce text-primary drop-shadow-md" />
						{/if}
					</div>
				{/if}
			{:else if usbMode}
				<UsbScannerGuide
					connected={usbScanTick > 0}
					scanTick={usbScanTick}
					{lastScanned}
					onUseCamera={useCameraInstead}
				/>
			{:else}
				<div class="w-full max-w-xl text-center">
					<div class="mx-auto w-max">
						<div class="rounded-lg border border-border/20 bg-background p-8">
							<Camera class="h-16 w-16 text-(--stat-success)" />
						</div>
					</div>
					<p class="mt-8 text-2xl font-bold">Ready to Scan</p>
					<p class="mt-3 text-base text-muted-foreground">
						Point your camera at the member's QR code
					</p>
					<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
						<Button
							class="inline-flex h-14 items-center gap-3 rounded-full bg-(--stat-success) px-8 text-base text-white shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
							onclick={toggleCamera}
						>
							<span
								class="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-white/10 text-white"
								><QrCode class="h-5 w-5" /></span
							>
							<span>Start Camera</span>
						</Button>
						{#if usbScannerEnabled}
							<Button
								variant="outline"
								class="inline-flex h-14 items-center gap-3 rounded-full px-8 text-base"
								onclick={useUsbScanner}
							>
								<Usb class="h-5 w-5" />
								<span>Use USB Scanner</span>
							</Button>
						{/if}
					</div>
				</div>
			{/if}

			{#if isPanelCollapsed && session && !isFullscreen}
				<div
					class="absolute top-4 left-4 z-10 rounded-full border border-border/50 bg-background/85 px-4 py-1.5 text-xs backdrop-blur"
				>
					<span class="font-semibold text-primary">{session.title}</span>
					<span class="text-muted-foreground"> · {session.timeStart} - {session.timeEnd}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Edge tab to bring the right panel back -->
	{#if isPanelCollapsed && !isFullscreen}
		<button
			class="absolute top-1/2 right-0 z-20 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
			onclick={togglePanel}
			title="Show panel"
			aria-label="Show panel"
		>
			<PanelRightOpen class="h-4 w-4" />
		</button>
	{/if}

	<!-- Right Column: Manual Entry + Recent -->
	<aside
		class="relative flex h-full min-h-0 min-w-0 flex-col space-y-6 overflow-hidden rounded-2xl transition-opacity duration-200 motion-reduce:transition-none {isPanelCollapsed
			? 'opacity-0'
			: 'opacity-100'}"
		inert={isPanelCollapsed}
	>
		<button
			class="absolute top-3 right-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			onclick={togglePanel}
			title="Hide panel"
			aria-label="Hide panel"
		>
			<PanelRightClose class="h-4 w-4" />
		</button>
		<!-- Active Event Banner -->
		{#if session}
			<Card class="border-primary/20 bg-primary/5">
				<CardHeader>
					<CardTitle class="text-primary">{session.title}</CardTitle>
					<CardDescription
						>{session.timeStart} - {session.timeEnd} • {session.location}</CardDescription
					>
				</CardHeader>
			</Card>
		{/if}

		<!-- Manual Entry -->
		<Card class="z-20 overflow-visible">
			<CardHeader>
				<CardTitle>Manual Check-In</CardTitle>
				<CardDescription>Search by Name or ID</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="relative flex gap-2">
					<div class="relative grid w-full items-center gap-1.5">
						<Label for="memberIdDesktop" class="sr-only">Member ID</Label>
						<Input
							id="memberIdDesktop"
							placeholder="Search name..."
							value={manualId}
							oninput={handleSearch}
							onkeydown={(e) => e.key === 'Enter' && handleManualSubmit()}
							autocomplete="off"
						/>

						{#if searchResults.length > 0}
							<div
								class="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-md"
							>
								<ScrollArea className="h-48">
									{#each searchResults as member}
										<button
											class="flex w-full flex-col px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
											onclick={() => selectMember(member)}
										>
											<span class="font-medium text-foreground"
												>{member.first_name} {member.last_name}</span
											>
											<span class="font-mono text-xs text-muted-foreground">{member.member_id}</span
											>
										</button>
									{/each}
								</ScrollArea>
							</div>
						{/if}
					</div>
					<Button onclick={handleManualSubmit} disabled={!manualId}>Check In</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Recent Scans -->
		<Card class="flex min-h-0 flex-1 flex-col">
			<CardHeader class="flex items-center justify-between">
				<CardTitle>Recent Scans</CardTitle>
				{#if recentScans.length > 0}
					<button class="text-xs text-(--stat-success)" onclick={() => (recentScans = [])}
						>Clear list</button
					>
				{/if}
			</CardHeader>
			<ScrollArea className="flex-1 h-px">
				<div class="space-y-4 p-6 pt-0">
					{#each recentScans as scan (scan.id + scan.time)}
						<div class="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3">
							<Avatar class="h-10 w-10 rounded-full">
								<AvatarImage
									src={`https://api.dicebear.com/7.x/initials/svg?seed=${scan.name}`}
									alt={scan.name}
								/>
							</Avatar>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-bold">{scan.name}</div>
								<div class="text-xs text-muted-foreground">{scan.time}</div>
							</div>
							<Check class="h-4 w-4 text-green-500" />
						</div>
					{:else}
						<div class="text-center text-sm text-muted-foreground mt-10">
							No scans yet this session.
						</div>
					{/each}
				</div>
			</ScrollArea>
		</Card>
	</aside>
</div>

<!-- The one overlay for every non-fullscreen layout (mobile and desktop alike). It is
     position:fixed, so a single instance covers them all. -->
{#if !isFullscreen}
	<ScanStatusModal
		state={scanState}
		showResultDetail={$systemSettings.scanModalEnabled}
		resultDuration={scanState.queueDepth > 0
			? BUSY_RESULT_MS
			: ($systemSettings.scanModalDuration ?? 5) * 1000}
		{rejection}
		onDismiss={dismissOverlay}
	/>
{/if}

{#if $kioskMode.enabled}
	{#if !activeEvent}
		<!--
			Kiosk standby. Only while nothing is ongoing - the moment loadActiveEvent's 30s
			poll (above) finds an event, activeEvent stops being null and this whole block
			stops rendering on its own; the real scanner underneath was mounted the entire
			time and needs no transition of its own to take over.

			z-[200]: above the fullscreen scanner's z-[100] and the guide tooltip, so if
			somehow both are true at once this still wins - standby should never be hidden
			behind a stale fullscreen scanner view.
		-->
		<!--
			The overlay's own fade is the handoff into scanning. When the event goes live this
			block simply stopped rendering and the scanner underneath appeared on a single
			frame, which reads as a glitch rather than as the system responding to the
			schedule. Out is quicker than in: getting out of the way of a queue matters more
			than easing into standby.
		-->
		<div
			class="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background to-muted"
			in:fade={{ duration: dur(350) }}
			out:fade={{ duration: dur(250) }}
		>
			<div class="absolute inset-x-0 top-0 flex items-center justify-between px-10 py-7">
				<div class="flex items-center gap-2.5">
					<!-- The system's own mark rather than the letters "QR" set in a box. -->
					<div
						class="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary text-primary-foreground"
					>
						<QrCode class="h-[18px] w-[18px]" />
					</div>
					<div>
						<div class="text-[13px] font-bold">{$systemSettings.siteName || siteConfig.name}</div>
						<div class="text-[11px] text-muted-foreground">Attendance kiosk</div>
					</div>
				</div>
				<div class="flex items-center gap-5">
					<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
						<span class="h-[7px] w-[7px] animate-pulse rounded-full bg-primary"></span>
						Listening for the next event
					</div>
					<div class="text-sm font-bold tabular-nums">{formatTimeSync(kioskNow)}</div>
				</div>
			</div>

			<!--
				Grid stack: during a change both states are mounted for a moment, and as normal
				flow siblings the outgoing one would shove the incoming one down the screen
				mid-fade. Sharing one cell keeps them on top of each other, centred, while they
				swap. Auto rows are correct here - unlike the kiosk's full-screen stack, these
				blocks should size to their content and let the parent flex centre them.
			-->
			<div class="grid [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:place-self-center">
				{#if nextEvent && kioskCountdown}
					<div
					class="max-w-[820px] text-center"
					in:fly={{ y: 8, duration: dur(350) }}
					out:fade={{ duration: dur(200) }}
				>
						<div class="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
							Up next
						</div>
						<div class="mt-2.5 text-5xl font-extrabold tracking-tight text-foreground">
							{nextEvent.event_name}
						</div>
						<div class="mt-2 text-lg text-muted-foreground">
							{formatTimeSync(new Date(ensureUTC(nextEvent.start_datetime)))}
						</div>

						<div class="mt-12 flex items-center justify-center gap-4">
							<div class="min-w-[108px]">
								<div class="text-6xl font-black text-primary tabular-nums">
									{pad2(kioskCountdown.hours)}
								</div>
								<div
									class="mt-1.5 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase"
								>
									Hours
								</div>
							</div>
							<div class="-mt-4 text-4xl font-light text-border">:</div>
							<div class="min-w-[108px]">
								<div class="text-6xl font-black text-primary tabular-nums">
									{pad2(kioskCountdown.minutes)}
								</div>
								<div
									class="mt-1.5 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase"
								>
									Minutes
								</div>
							</div>
							<div class="-mt-4 text-4xl font-light text-border">:</div>
							<div class="min-w-[108px]">
								<!--
									Only the seconds move, matching the native kiosk. Hours and minutes
									change so rarely that animating them adds nothing, and three ticking
									columns turn an unattended screen into a slot machine. The invisible
									copy holds the box open - the animated one is absolute, so without
									it this collapses to zero height.
								-->
								<div
									class="relative overflow-hidden text-6xl font-black text-primary tabular-nums"
								>
									<span class="invisible" aria-hidden="true">
										{pad2(kioskCountdown.seconds)}
									</span>
									{#key kioskCountdown.seconds}
										<span
											class="absolute inset-0"
											in:fly={{ y: 14, duration: dur(150) }}
											out:fly={{ y: -14, duration: dur(150) }}
										>
											{pad2(kioskCountdown.seconds)}
										</span>
									{/key}
								</div>
								<div
									class="mt-1.5 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase"
								>
									Seconds
								</div>
							</div>
						</div>

						<div class="mt-9 text-sm text-muted-foreground">
							Scanning opens automatically the moment the event goes live - nothing to tap.
						</div>
					</div>
				{:else if nextEvent && kioskEventOverdue}
					<!-- The countdown's third state, not its last tick: 00:00:00 would sit there
					     forever if the event's status hasn't flipped to ongoing yet, and reads as
					     the kiosk having frozen rather than as "any second now." -->
					<div
					class="max-w-[620px] text-center"
					in:fly={{ y: 8, duration: dur(350) }}
					out:fade={{ duration: dur(200) }}
				>
						<div class="flex items-center justify-center gap-2.5">
							<span class="h-2.5 w-2.5 animate-pulse rounded-full bg-primary"></span>
							<span class="text-xs font-bold tracking-[0.14em] text-primary uppercase">
								Starting now
							</span>
						</div>
						<div class="mt-3 text-5xl font-extrabold tracking-tight text-foreground">
							{nextEvent.event_name}
						</div>
						<div class="mt-3 text-sm text-muted-foreground">
							Waiting on the scanner to pick it up - this takes a moment, not a tap.
						</div>
					</div>
				{:else}
					<!-- Genuinely different copy, not the countdown with zeroes in it - a 00:00:00
					     reads as broken, not as "nothing is scheduled." -->
					<div
					class="max-w-[620px] text-center"
					in:fly={{ y: 8, duration: dur(350) }}
					out:fade={{ duration: dur(200) }}
				>
						<div
							class="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-[20px] border bg-card shadow-xs"
						>
							<Calendar class="h-8 w-8 text-muted-foreground" />
						</div>
						<div class="mt-6 text-[32px] font-extrabold">Nothing scheduled right now</div>
						<div class="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
							The kiosk keeps watching - as soon as an event is scheduled and its start time
							arrives, this screen updates on its own.
						</div>
					</div>
				{/if}
			</div>

			<button
				type="button"
				class="absolute right-7 bottom-6 flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-[11.5px] text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground"
				onclick={exitKioskMode}
			>
				<LogOut class="h-3.5 w-3.5" />
				Exit kiosk
			</button>
		</div>
	{:else}
		<!-- Scanning is live: the real UI renders underneath, untouched. Only the exit
		     affordance persists on top of it, same corner, same gate. -->
		<button
			type="button"
			class="fixed right-7 bottom-6 z-[200] flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-[11.5px] text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground"
			onclick={exitKioskMode}
		>
			<LogOut class="h-3.5 w-3.5" />
			Exit kiosk
		</button>
	{/if}

	<ElevationDialog />
{/if}

<style>
	@keyframes scan {
		0%,
		100% {
			top: 10%;
		}
		50% {
			top: 90%;
		}
	}

	/* Force Video to fill container properly */
	:global(#reader-mobile video) {
		object-fit: cover;
		width: 100% !important;
		height: 100% !important;
		border-radius: inherit;
	}

	:global(#reader-desktop video) {
		object-fit: cover;
		width: 100% !important;
		height: 100% !important;
		border-radius: inherit;
	}

	:global(.mirror-camera video) {
		transform: scaleX(-1) !important;
	}

	:global(.mirror-camera canvas) {
		transform: scaleX(-1) !important;
	}

	/* Ensure Sonner toasts appear above fullscreen camera */
	:global([data-sonner-toaster]) {
		z-index: 9999 !important;
	}

	:global([data-sonner-toast]) {
		z-index: 9999 !important;
	}
</style>

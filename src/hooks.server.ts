import { sequence } from '@sveltejs/kit/hooks';
import { redirect, error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';

/**
 * Domain routing hook
 * Restricts access to admin panel on the check-in domain
 * check-in-bbct.vercel.app: Only check-in and display routes allowed
 * qr-attendance-bbct-v2.vercel.app: Full access including admin panel
 */
const domainRouting: Handle = async ({ event, resolve }) => {
	const hostname = event.url.hostname;
	const pathname = event.url.pathname;

	// check-in-bbct.vercel.app domain - only allow check-in and display routes
	if (hostname === 'check-in-bbct.vercel.app') {
		// Allow check-in routes
		if (pathname.startsWith('/check-in/')) {
			return resolve(event);
		}
		// Allow display routes
		if (pathname.startsWith('/display/')) {
			return resolve(event);
		}
		// Allow login page
		if (pathname.startsWith('/login')) {
			return resolve(event);
		}
		// Allow public assets
		if (pathname.startsWith('/static/')) {
			return resolve(event);
		}

		// Handle root path - redirect to latest event or show waiting page
		if (pathname === '/') {
			try {
				// Get the latest/current event
				const { data: currentEvent } = await supabase
					.from('events')
					.select('event_id, event_name, status')
					.eq('status', 'live')
					.single();

				if (currentEvent) {
					// Redirect to the live event's check-in page
					return redirect(302, `/check-in/${currentEvent.event_id}`);
				}

				// If no live event, try to get the most recent event
				const { data: recentEvent } = await supabase
					.from('events')
					.select('event_id, event_name, status')
					.order('event_date', { ascending: false })
					.limit(1)
					.single();

				if (recentEvent) {
					// Redirect to the most recent event's check-in page
					return redirect(302, `/check-in/${recentEvent.event_id}`);
				}

				// No event found - show waiting page
				return error(503, 'No events available. Please wait for an event to be scheduled.');
			} catch (err) {
				console.error('Error fetching event:', err);
				// Fallback if database query fails
				return error(503, 'Service temporarily unavailable. Please wait for another event.');
			}
		}

		// Reject all other routes (including admin panel)
		return error(404, 'Not found');
	}

	// For all other domains/localhost, allow full access
	return resolve(event);
};

/**
 * Security headers.
 *
 * The site previously served none at all. Beyond the direct hardening value, their absence is
 * one of the signals that contributed to Google Safe Browsing classifying this deployment as a
 * phishing site: a credential form on a free *.vercel.app subdomain with no security posture
 * looks like a throwaway kit rather than a maintained application.
 *
 * The Content-Security-Policy itself is declared in svelte.config.js via `kit.csp`, which can
 * hash SvelteKit's own inline bootstrap script - something that cannot be done from here
 * without falling back to 'unsafe-inline' for scripts.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');

	// camera=(self) is deliberate: the QR scanner needs it. Blanket-denying would break /scan
	// and the self check-in kiosk.
	response.headers.set(
		'Permissions-Policy',
		'camera=(self), microphone=(), geolocation=(), payment=(), usb=()'
	);

	return response;
};

export const handle = sequence(securityHeaders, domainRouting);

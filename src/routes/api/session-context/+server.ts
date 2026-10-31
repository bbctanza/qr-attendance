import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Session context endpoint.
 *
 * Returns the caller's IP and coarse location for the Active Sessions list, read from the
 * request itself rather than a third-party geolocation API. Replaces a client-side call to
 * ipapi.co, which leaked the user's IP to an outside service, was rate limited, and was
 * routinely blocked by ad blockers (the cause of the "Unknown Location" rows).
 *
 * Geo headers are injected by Vercel's edge network. On localhost they are absent, so the
 * response falls back to a local-development placeholder.
 */
export const GET: RequestHandler = ({ request, getClientAddress }) => {
	const header = (name: string) => request.headers.get(name)?.trim() || '';

	// x-forwarded-for is a chain; the first entry is the original client.
	const forwardedFor = header('x-forwarded-for').split(',')[0].trim();

	let ip = forwardedFor || header('x-real-ip');
	if (!ip) {
		try {
			ip = getClientAddress();
		} catch {
			ip = '';
		}
	}

	const city = header('x-vercel-ip-city');
	const country = header('x-vercel-ip-country');

	// decodeURIComponent: Vercel percent-encodes city names containing spaces/accents.
	const decode = (value: string) => {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	};

	const parts = [decode(city), country].filter(Boolean);
	const isLocal = !ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.');

	return json(
		{
			ip: ip || 'Unknown',
			location: parts.length ? parts.join(', ') : isLocal ? 'Local development' : 'Unknown Location'
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};

import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		alias: {
			'@/*': './path/to/lib/*'
		},

		/**
		 * Content Security Policy.
		 *
		 * Declared here rather than in hooks.server.ts so SvelteKit can hash/nonce its own inline
		 * bootstrap script; writing this header by hand would mean allowing 'unsafe-inline' for
		 * scripts, which defeats most of the point.
		 *
		 * Supabase is matched by wildcard on purpose. Pinning the exact project URL would mean
		 * reading PUBLIC_SUPABASE_URL at config-load time, which happens before Vite loads .env -
		 * an undefined value there would silently ship a CSP that blocks every API call.
		 */
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],

				// Turnstile injects its script tag at runtime (svelte-turnstile loads
				// challenges.cloudflare.com/turnstile/v0/api.js) and renders the widget in an iframe.
				'script-src': ['self', 'https://challenges.cloudflare.com'],
				'frame-src': ['self', 'https://challenges.cloudflare.com'],

				// Supabase REST/auth/storage over HTTPS, plus the Realtime WebSocket that the
				// session watchdog depends on - without wss: a revoked device never gets its kick.
				// challenges.cloudflare.com is included because Turnstile's loader can issue
				// requests from the parent document, not only from inside its own iframe; omitting
				// it risks breaking sign-in, which is not a failure worth gambling on.
				'connect-src': [
					'self',
					'https://*.supabase.co',
					'wss://*.supabase.co',
					'https://challenges.cloudflare.com'
				],

				// Tailwind and the inline style="" blocks on the login and welcome pages.
				'style-src': ['self', 'unsafe-inline'],

				// data:/blob: cover generated QR codes and jsPDF/jszip output; https: keeps avatars
				// (api.dicebear.com) and Supabase storage working without enumerating every host.
				'img-src': ['self', 'data:', 'blob:', 'https:'],
				'font-src': ['self', 'data:'],
				'media-src': ['self', 'blob:'],
				'worker-src': ['self', 'blob:'],

				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;

export const siteConfig = {
	name: 'QR Attendance System',
	description: 'Attendance Tracking System',
	logo: null, // Placeholder for future SVG/Image upload
	theme: {
		primary: 'green'
	},

	/**
	 * Who operates this system.
	 *
	 * This is deliberately public and prominent. The site previously showed the outside world
	 * nothing but a password prompt, which is part of why Google Safe Browsing classified it as
	 * a phishing page — an anonymous credential form on a free *.vercel.app subdomain looks
	 * exactly like a phishing kit. A named operator with a contact route is what tells both the
	 * classifier and a human reviewer that a real organisation stands behind the login.
	 */
	organization: {
		name: 'Bible Baptist Church Tanza',
		tagline: 'John 12:32 — A Place Where Christ is Lifted Up',
		/** One plain sentence on what the system does, for the public landing page. */
		purpose:
			'This is the internal attendance system for Bible Baptist Church Tanza. Members check in with a QR code at church services and events. Sign-in is for church staff only.',
		// TODO: replace with a real monitored address — a reviewer may actually use it.
		contactEmail: 'REPLACE_ME@example.com'
	}
};

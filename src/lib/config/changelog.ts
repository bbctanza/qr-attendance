/**
 * Changelog entries - newest first
 * Update this whenever you make significant changes/bugfixes
 */
export interface ChangelogEntry {
	version: string;
	date: string;
	title: string;
	items: string[];
}

export const CURRENT_VERSION = '2.1.0';

export const changelog: ChangelogEntry[] = [
	{
		version: '2.1.0',
		date: 'February 8, 2026',
		title: 'Enhanced Features & Admin System',
		items: [
			// Self Check-In & Projector Display
			'Self check-in feature - Allow attendees to scan their own QR codes without staff assistance',
			'Projector display mode - Show QR codes on screen for group-based check-in scenarios',
			'Secure QR code scanning - Added Supabase secure functions for safe self-check-in',

			// Admin & User Management
			'User invitation system - Send invites to team members with role assignment',
			'User role management - Update user roles and permissions after account creation',
			'User deletion functionality - Remove users from the system when needed',
			'Password visibility toggle - Show/hide password input for better UX',
			'Improved admin verification - Enhanced security checks in invitation service',

			// Event Management Enhancements
			'Event metadata - Store additional event information and configuration',
			'Recurring events - Support for recurring event patterns',
			'Enhanced event type system - More flexible event configuration options',

			// Overview & Analytics
			'Overview page - New dashboard showing live event statistics',
			'Recent history display - Quick access to latest attendance records',
			'Event performance insights - See real-time stats during check-in',

			// Notifications & Data Persistence
			'Persistent notifications - Notification history saved to localStorage',
			'Better notification display - Improved toast and modal notifications',

			// UI & Design Improvements
			'Background image support - Customizable background for better aesthetics',
			'Footer refactoring - Improved footer layout and structure',
			'Theme handling - Better management of light/dark theme preferences',
			'Error page - User-friendly 404 error page with countdown redirect',
			'Dialog improvements - Fixed dialog closing syntax issues',

			// Member ID System
			'Updated member ID format - Now uses BBCT-{groupCode}-{sequentialNumber} pattern',
			'Better member identification - Clearer member tracking across groups'
		]
	},
	{
		version: '2.0.0',
		date: 'February 7, 2026',
		title: 'Major Update - Smarter Attendance & Member Management',
		items: [
			// Member Management
			'Edit member details anytime - Update names, info, and assignments without starting over',
			'Delete members - Cleanly remove members from the system when needed',
			'Better member organization - Improved member search and filtering',
			'Export member list - Download all member information to Excel for records and reports',

			// Check-In & Scanning
			'Faster QR code scanning - Fixed scanner lag issues so it works smoothly every time',
			'No more reload glitches - Scanner works perfectly without needing to refresh',
			'Fullscreen scanning mode - Better camera view for faster QR detection',
			'Grouped check-in entry - Add multiple people at once before checking them in (saves time!)',
			'Manual check-in improvements - Easier way to mark attendance when QR codes aren\'t available',

			// QR Card Generation
			'Built-in QR card design - Create professional QR cards without extra software',
			'Instant generation - Make ID cards right in the app instead of editing elsewhere',
			'Print-ready cards - Get cards ready to print immediately',

			// New Analytics Page
			'Attendance statistics - See who\'s attending most and trends over time',
			'Event performance metrics - Understand which events get the most attendance',
			'Visual reports - Charts and graphs that are easy to understand at a glance',

			// Design & User Interface
			'Better mobile app - Easier to use on phones and tablets for on-the-go check-ins',
			'Improved desktop version - Cleaner layout for office/admin work',
			'Responsive design - System works great on all screen sizes and devices',
			'Cleaner modals - Better popups and notification messages',

			// Additional Improvements
			'Faster overall performance - App loads quicker and responds instantly',
			'Better error messages - When something goes wrong, we tell you exactly what\'s wrong',
			'Improved notifications - Real-time updates so you know immediately when someone checks in',
			'Better data exports - More ways to download and backup your data'
		]
	},
	{
		version: '1.9.0',
		date: 'February 1, 2026',
		title: 'Complete System Rewrite - Migration from React to SvelteKit',
		items: [
			// Framework Migration
			'Migrated from React 18 to SvelteKit for improved performance and smaller bundle size',
			'Replaced React Router v7 with SvelteKit routing system',
			'Replaced Fluent UI and custom Lucide React with comprehensive shadcn-svelte component library',
			'Upgraded from Vite-based React setup to native SvelteKit architecture',

			// Architecture Improvements
			'Restructured project from pages/components/service layers to SvelteKit standard conventions',
			'Moved all business logic to lib/ directory with API, stores, and utility modules',
			'Implemented Svelte stores for global state management (replacing React Context)',
			'Added reactive hooks for mobile detection and persistent state management',

			// UI/UX Enhancements
			'Rebuilt all components using Svelte reactive syntax and shadcn-svelte',
			'Implemented improved responsive design with better mobile-first approach',
			'Added enhanced modal system with onboarding, changelog, and status modals',
			'Improved accessibility with semantic HTML and proper ARIA attributes',
			'Added native Toast notifications via Sonner integration',
			'Implemented responsive sidebar with mobile drawer variant',

			// Authentication & Security
			'Streamlined Supabase authentication with server hooks (hooks.server.ts)',
			'Improved session management with persistent authentication state',
			'Added automatic session validation on page loads',

			// Event & Automation System
			'Completely rewrote event automation logic for better reliability',
			'Improved event creation with proper timezone handling (Asia/Manila)',
			'Enhanced event status transitions with accurate time calculations',
			'Added comprehensive automation logging and monitoring',
			'Implemented post-event archival with proper transaction handling',

			// Attendance Tracking
			'Rebuilt QR scanning interface with improved UX and error handling',
			'Implemented real-time attendance updates with Supabase subscriptions',
			'Added better attendance history filtering and export functionality',
			'Improved manual entry process with validation and confirmation',

			// Member Management
			'Enhanced member directory with search and filter capabilities',
			'Improved care group management and assignments',
			'Added member ID system with validation',

			// Data Management
			'Implemented CSV export for attendance and member data',
			'Added data import/backup restore functionality',
			'Improved data integrity with better error handling and validation',

			// Development & Testing
			'Added comprehensive TypeScript support with strict mode enabled',
			'Implemented Playwright E2E tests for critical user flows',
			'Added Vitest for unit testing',
			'Added ESLint and Prettier for code quality',
			'Improved development experience with dev mode and time mocking',

			// Performance
			'Significantly reduced bundle size through SvelteKit optimization',
			'Improved initial page load performance with better code splitting',
			'Optimized database queries with proper indexing',
			'Implemented lazy loading for components and routes',

			// Documentation
			'Updated README with complete V2 architecture documentation',
			'Added inline code documentation for complex logic',
			'Created comprehensive changelog system'
		]
	}
];

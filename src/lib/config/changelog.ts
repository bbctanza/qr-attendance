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

export const CURRENT_VERSION = '1.1.0';

export const changelog: ChangelogEntry[] = [
	{
		version: '1.1.0',
		date: 'February 7, 2026',
		title: 'Event System Overhaul',
		items: [
			'Fixed recurring event generation with timezone-aware automation',
			'Fixed time conversion bug in convertToUTC (24-hour format)',
			'Added delete functionality for recurring event templates',
			'Improved event status automation logging',
			'Fixed custom event time display and calculations',
			'Implemented proper UTC/local timezone handling throughout'
		]
	},
	{
		version: '1.0.0',
		date: 'February 4, 2026',
		title: 'Initial Release',
		items: [
			'User onboarding system with profile setup',
			'Complete event management (recurring & custom)',
			'Attendance tracking with QR scanning',
			'Member and group management',
			'Dashboard analytics',
			'Real-time session management'
		]
	}
];

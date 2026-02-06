import { systemSettings } from '$lib/stores/settings';
import { supabase } from '$lib/supabase';
import { get } from 'svelte/store';

/**
 * Ensure a datetime string is in proper ISO UTC format
 * Converts database strings like "2026-02-06 07:21:00" to "2026-02-06T07:21:00Z"
 */
export function ensureUTC(dateString: string): string {
	if (!dateString) return '';
	
	// If already has Z or T with timezone info, return as-is
	if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-00:')) {
		return dateString;
	}
	
	// If it's a database string like "2026-02-06 07:21:00", convert to ISO UTC
	if (dateString.includes(' ') && !dateString.includes('T')) {
		return dateString.replace(' ', 'T') + 'Z';
	}
	
	// If it's already ISO but missing Z, add it
	if (dateString.includes('T') && !dateString.includes('Z')) {
		return dateString + 'Z';
	}
	
	return dateString;
}

/**
 * Get the user's timezone, with fallback to database or default
 */
async function getUserTimezone(): Promise<string> {
	const defaultTimezone = 'Asia/Manila';
	
	try {
		const settings = get(systemSettings);
		if (settings?.timezone) {
			return settings.timezone;
		}
	} catch {
		// Store might not be available
	}

	// If store doesn't have it, try database
	try {
		const { data } = await supabase
			.from('system_settings')
			.select('timezone')
			.eq('id', 1)
			.single();

		if (data?.timezone) {
			return data.timezone;
		}
	} catch {
		// Database unavailable, use default
	}

	return defaultTimezone;
}

/**
 * Format a datetime string to user's timezone and preferred format
 * @param dateString - ISO datetime string or database string
 * @param showTime - Whether to show time (default: true)
 * @returns Formatted string in user's timezone
 */
export async function formatLocalDateTime(dateString: string, showTime = true): Promise<string> {
	if (!dateString) return '';

	// Ensure the date string is in proper UTC format
	const utcString = ensureUTC(dateString);
	const timezone = await getUserTimezone();
	const use12HourFormat = typeof localStorage !== 'undefined' && localStorage.getItem('time_format') === '12h';

	const date = new Date(utcString);

	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			...(showTime && {
				hour: '2-digit',
				minute: '2-digit',
				hour12: use12HourFormat
			})
		});

		return formatter.format(date);
	} catch (e) {
		console.warn('Invalid timezone:', timezone, e);
		// Fallback to browser's locale
		return showTime ? date.toLocaleString() : date.toLocaleDateString();
	}
}

/**
 * Format a 'HH:mm:ss' time string (e.g. from postgres time column) into a friendly display string
 * Does NOT perform timezone conversion. Assumes time is already in target timezone.
 */
export function formatTimeColumn(timeString: string): string {
	if (!timeString) return '';
	
	const [hours, minutes] = timeString.split(':').map(Number);
	const date = new Date();
	date.setHours(hours);
	date.setMinutes(minutes);
	
	const use12HourFormat = typeof localStorage !== 'undefined' && localStorage.getItem('time_format') !== '24h'; // Default to 12h

	return date.toLocaleTimeString([], { 
		hour: 'numeric', 
		minute: '2-digit', 
		hour12: use12HourFormat 
	});
}

/**
 * Format only the time part of a datetime string
 * @param dateString - ISO datetime string or database string
 * @returns Formatted time in user's timezone and format preference
 */
export async function formatLocalTime(dateString: string): Promise<string> {
	if (!dateString) return '';

	// Ensure the date string is in proper UTC format
	const utcString = ensureUTC(dateString);
	const timezone = await getUserTimezone();
	const use12HourFormat = typeof localStorage !== 'undefined' && localStorage.getItem('time_format') === '12h';

	const date = new Date(utcString);

	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: use12HourFormat
		});

		return formatter.format(date);
	} catch (e) {
		console.warn('Invalid timezone:', timezone, e);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: use12HourFormat });
	}
}

/**
 * Convert user's local time input to UTC for storage
 * @param localDateString - Date string from user input (YYYY-MM-DD)
 * @param timeString - Time string from user input (HH:mm)
 * @returns ISO string in UTC
 */
export async function convertToUTC(localDateString: string, timeString: string): Promise<string> {
	if (!localDateString || !timeString) return '';

	const timezone = await getUserTimezone();

	try {
		// Parse input: user wants this date/time in their LOCAL timezone
		const [year, month, day] = localDateString.split('-').map(Number);
		const [hour, minute] = timeString.split(':').map(Number);

		// Step 1: Create a temporary UTC date to format in the user's timezone
		// We'll use an arbitrary UTC time and adjust until it matches
		const testDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

		// Step 2: Create formatter for the user's timezone
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false // CRITICAL: enforce 24h format for consistent calculation logic
		});

		// Step 3: Check what time this UTC date shows in user's timezone
		let parts = formatter.formatToParts(testDate);
		let displayedDay = parseInt(parts.find(p => p.type === 'day')?.value || '1');
		let displayedHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
		let displayedMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

		// Step 4: Calculate the offset
		const hourDiff = hour - displayedHour;
		const minuteDiff = minute - displayedMinute;
		const dayDiff = day - displayedDay;

		// Step 5: Apply the offset to get the correct UTC time
		testDate.setUTCHours(testDate.getUTCHours() + hourDiff);
		testDate.setUTCMinutes(testDate.getUTCMinutes() + minuteDiff);
		testDate.setUTCDate(testDate.getUTCDate() + dayDiff);

		// Step 6: Verify it's correct
		parts = formatter.formatToParts(testDate);
		displayedHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
		displayedMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
		displayedDay = parseInt(parts.find(p => p.type === 'day')?.value || '1');

		// If not correct, adjust once more
		if (displayedHour !== hour || displayedMinute !== minute || displayedDay !== day) {
			const finalHourDiff = hour - displayedHour;
			const finalMinuteDiff = minute - displayedMinute;
			const finalDayDiff = day - displayedDay;
			testDate.setUTCHours(testDate.getUTCHours() + finalHourDiff);
			testDate.setUTCMinutes(testDate.getUTCMinutes() + finalMinuteDiff);
			testDate.setUTCDate(testDate.getUTCDate() + finalDayDiff);
		}

		return testDate.toISOString();
	} catch (e) {
		console.warn('Error converting to UTC:', e);
		// Fallback: assume the input is UTC
		return `${localDateString}T${timeString}:00Z`;
	}
}

/**
 * Get time range string in user's timezone
 * @param startDateTime - Start ISO datetime string
 * @param endDateTime - End ISO datetime string
 * @returns Formatted time range "HH:mm - HH:mm"
 */
export async function formatTimeRange(startDateTime: string, endDateTime: string): Promise<string> {
	const startTime = await formatLocalTime(startDateTime);
	const endTime = await formatLocalTime(endDateTime);
	return `${startTime} - ${endTime}`;
}

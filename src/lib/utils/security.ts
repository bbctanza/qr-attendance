/**
 * Security utilities for XSS prevention and input sanitization
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param str - The string to escape
 * @returns The escaped string safe for HTML context
 */
export function escapeHtml(str: string | null | undefined): string {
	if (!str) return '';
	
	const htmlEscapeMap: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#x27;',
		'/': '&#x2F;'
	};
	
	return String(str).replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Sanitizes text content by removing potentially dangerous characters
 * and limiting length to prevent buffer overflow attacks
 * @param str - The string to sanitize
 * @param maxLength - Maximum allowed length (default: 500)
 * @returns The sanitized string
 */
export function sanitizeText(str: string | null | undefined, maxLength: number = 500): string {
	if (!str) return '';
	
	// Escape HTML entities
	let sanitized = escapeHtml(str);
	
	// Remove any remaining potentially dangerous patterns
	sanitized = sanitized
		.replace(/javascript:/gi, '')
		.replace(/on\w+=/gi, '')
		.replace(/data:/gi, '')
		.replace(/vbscript:/gi, '')
		.trim();
	
	// Limit length to prevent DoS attacks
	if (sanitized.length > maxLength) {
		sanitized = sanitized.substring(0, maxLength) + '...';
	}
	
	return sanitized;
}

/**
 * Validates and sanitizes user IDs (alphanumeric + hyphens)
 * @param id - The ID to validate
 * @returns The sanitized ID or empty string if invalid
 */
export function sanitizeId(id: string | null | undefined): string {
	if (!id) return '';
	
	// Only allow alphanumeric characters, hyphens, and underscores
	const sanitized = String(id).replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 100);
	return sanitized;
}

/**
 * Validates email format
 * @param email - The email to validate
 * @returns true if valid email format
 */
export function isValidEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(String(email).trim());
}

/**
 * Sanitizes error messages from external APIs/databases
 * to prevent information disclosure and XSS
 * @param error - The error object or message
 * @returns A safe error message
 */
export function sanitizeErrorMessage(error: unknown): string {
	if (!error) return 'An error occurred';
	
	// Extract message safely
	let message = '';
	
	if (typeof error === 'string') {
		message = error;
	} else if (typeof error === 'object' && error !== null) {
		const errorObj = error as Record<string, unknown>;
		if (typeof errorObj.message === 'string') {
			message = errorObj.message;
		} else if (typeof errorObj.msg === 'string') {
			message = errorObj.msg;
		} else {
			message = 'An unexpected error occurred';
		}
	} else {
		message = 'An unexpected error occurred';
	}
	
	// Don't expose stack traces or internal details
	if (message.includes('stack') || message.includes('at ')) {
		return 'An unexpected error occurred';
	}
	
	// Sanitize and limit length
	return sanitizeText(message, 200);
}

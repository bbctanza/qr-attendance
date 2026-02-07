import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

// ============================================
// ERROR HANDLING UTILITIES
// ============================================

interface SupabaseErrorResponse {
	error?: {
		message: string;
		details?: string;
		hint?: string;
		code?: string;
	};
	code?: string;
	message?: string;
	hint?: string;
	details?: string;
}

export interface FormattedError {
	title: string;
	message: string;
	code?: string;
	action?: string;
}

/**
 * Format errors from various sources (Supabase, network, validation, etc.)
 * into user-friendly, descriptive messages.
 */
export function formatError(error: any): FormattedError {
	// Handle null/undefined
	if (!error) {
		return {
			title: 'Unknown Error',
			message: 'An unexpected error occurred. Please try again.',
			code: 'UNKNOWN'
		};
	}

	// Convert to string if needed
	const errorStr = error.message || error.toString?.() || '';
	const errorCode = error.code || '';

	// ============================================
	// PERMISSION/RLS ERRORS
	// ============================================
	if (
		errorStr.includes('permission denied') ||
		errorStr.includes('new row violates row-level security policy') ||
		errorCode === 'PGRST301'
	) {
		return {
			title: 'Permission Denied',
			message: 'You do not have permission to perform this action. Contact an administrator if you believe this is an error.',
			code: 'PERMISSION_DENIED',
			action: 'Check your user role and permissions'
		};
	}

	// ============================================
	// AUTHENTICATION ERRORS
	// ============================================
	if (
		errorStr.includes('unauthorized') ||
		errorStr.includes('invalid credential') ||
		errorStr.includes('session') ||
		errorCode === 'PGRST301' ||
		errorCode === 'AUTH'
	) {
		return {
			title: 'Authentication Failed',
			message: 'Your session has expired or is invalid. Please log in again.',
			code: 'AUTH_ERROR',
			action: 'Sign in again'
		};
	}

	// ============================================
	// CONSTRAINT VIOLATIONS (Unique, FK, Check)
	// ============================================
	if (
		errorStr.includes('duplicate key') ||
		errorStr.includes('violates unique constraint') ||
		errorStr.includes('already exists')
	) {
		return {
			title: 'Duplicate Entry',
			message: 'This entry already exists. Please use a different value or update the existing entry.',
			code: 'DUPLICATE_ERROR'
		};
	}

	if (
		errorStr.includes('foreign key constraint') ||
		errorStr.includes('violates foreign key constraint')
	) {
		return {
			title: 'Referenced Record Missing',
			message: 'The referenced record does not exist or has been deleted. Please select a valid option.',
			code: 'FK_ERROR'
		};
	}

	if (
		errorStr.includes('violates check constraint') ||
		errorStr.includes('new row for relation')
	) {
		return {
			title: 'Invalid Value',
			message: 'The value provided does not meet the requirements. Please check your input.',
			code: 'CHECK_ERROR'
		};
	}

	// ============================================
	// NETWORK ERRORS
	// ============================================
	if (
		errorStr.includes('network') ||
		errorStr.includes('fetch') ||
		errorStr.includes('disconnected') ||
		errorStr.includes('timeout')
	) {
		return {
			title: 'Network Error',
			message: 'Unable to connect to the server. Check your internet connection and try again.',
			code: 'NETWORK_ERROR',
			action: 'Check your connection'
		};
	}

	// ============================================
	// VALIDATION ERRORS
	// ============================================
	if (
		errorStr.includes('invalid') ||
		errorStr.includes('must be') ||
		errorStr.includes('required') ||
		errorStr.includes('invalid_param')
	) {
		return {
			title: 'Invalid Input',
			message: 'The information provided is invalid. Please check your input and try again.',
			code: 'VALIDATION_ERROR'
		};
	}

	// ============================================
	// CAMERA/DEVICE ERRORS
	// ============================================
	if (
		errorStr.includes('camera') ||
		errorStr.includes('device not found') ||
		errorStr.includes('NotFoundError')
	) {
		return {
			title: 'Camera Error',
			message: 'Camera is not available or has been disconnected. Check your device and permissions.',
			code: 'DEVICE_ERROR',
			action: 'Grant camera permissions or try a different device'
		};
	}

	if (
		errorStr.includes('NotAllowedError') ||
		errorStr.includes('permission') ||
		errorStr.includes('denied')
	) {
		return {
			title: 'Permission Required',
			message: 'Camera or device access was denied. Enable these permissions in your browser settings.',
			code: 'DEVICE_PERMISSION',
			action: 'Allow camera access in settings'
		};
	}

	// ============================================
	// STORAGE ERRORS
	// ============================================
	if (
		errorStr.includes('storage') ||
		errorStr.includes('bucket') ||
		errorStr.includes('object not found')
	) {
		return {
			title: 'Storage Error',
			message: 'Unable to access the file storage. Please try again.',
			code: 'STORAGE_ERROR'
		};
	}

	if (
		errorStr.includes('file size') ||
		errorStr.includes('too large') ||
		errorStr.includes('5MB')
	) {
		return {
			title: 'File Too Large',
			message: 'The file size exceeds the 5MB limit. Please choose a smaller file.',
			code: 'FILE_SIZE_ERROR'
		};
	}

	// ============================================
	// DATABASE/SERVER ERRORS
	// ============================================
	if (
		errorStr.includes('internal server error') ||
		errorStr.includes('500') ||
		errorCode.startsWith('500')
	) {
		return {
			title: 'Server Error',
			message: 'The server encountered an error. Please try again in a few moments.',
			code: 'SERVER_ERROR',
			action: 'Try again later'
		};
	}

	if (
		errorStr.includes('not found') ||
		errorStr.includes('404') ||
		errorCode.includes('notfound')
	) {
		return {
			title: 'Not Found',
			message: 'The requested resource does not exist. It may have been deleted.',
			code: 'NOT_FOUND'
		};
	}

	// ============================================
	// FALLBACK
	// ============================================
	return {
		title: 'Error Occurred',
		message: errorStr || 'An unexpected error occurred. Please try again.',
		code: errorCode || 'UNKNOWN'
	};
}

/**
 * Extract user-friendly error message from various error types
 */
export function getErrorMessage(error: any): string {
	const formatted = formatError(error);
	return formatted.message;
}

/**
 * Extract error title from various error types
 */
export function getErrorTitle(error: any): string {
	const formatted = formatError(error);
	return formatted.title;
}

/**
 * Error Handler Utility
 * Provides helper functions for displaying formatted error, warning, and success toasts
 * Built on top of the error formatting utilities in $lib/utils.ts
 */

import { toast } from 'svelte-sonner';
import { getErrorMessage, getErrorTitle } from '$lib/utils';

/**
 * Show a formatted error toast with title and message
 * Automatically extracts meaningful error information
 */
export function showErrorToast(error: unknown, fallbackMessage?: string): void {
	const title = getErrorTitle(error);
	const message = getErrorMessage(error);
	
	if (fallbackMessage) {
		toast.error(`${fallbackMessage}: ${message}`);
	} else {
		toast.error(`${title}: ${message}`);
	}
}

/**
 * Show a warning toast (yellow/amber) with simple text
 */
export function showWarningToast(message: string, title?: string): void {
	if (title) {
		toast.warning(`${title}: ${message}`);
	} else {
		toast.warning(message);
	}
}

/**
 * Show a success toast with message
 */
export function showSuccessToast(message: string): void {
	toast.success(message);
}

/**
 * Show an info toast with message
 */
export function showInfoToast(message: string): void {
	toast.info(message);
}

/**
 * Show a loading toast that can be updated
 * Returns the toast ID for updating/dismissing
 */
export function showLoadingToast(message: string): string | number {
	return toast.loading(message);
}

/**
 * Update an existing toast
 */
export function updateToast(id: string | number, options: {
	message?: string;
	type?: 'success' | 'error' | 'warning' | 'info' | 'loading';
	duration?: number;
}): void {
	if (options.type === 'success') {
		toast.success(options.message || '', { id });
	} else if (options.type === 'error') {
		toast.error(options.message || '', { id });
	} else if (options.type === 'warning') {
		toast.warning(options.message || '', { id });
	} else if (options.type === 'info') {
		toast.info(options.message || '', { id });
	} else if (options.type === 'loading') {
		toast.loading(options.message || '', { id });
	}
}

/**
 * Dismiss a toast by ID
 */
export function dismissToast(id: string | number): void {
	toast.dismiss(id);
}

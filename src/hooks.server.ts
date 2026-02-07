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
    // Allow public assets and root
    if (pathname === '/' || pathname.startsWith('/static/')) {
      return resolve(event);
    }
    // Reject all other routes (including admin panel)
    return error(404, 'Not found');
  }

  // For all other domains/localhost, allow full access
  return resolve(event);
};

/**
 * Session validation hook
 * Checks if the current user's session is still active in the database.
 * If a session is marked as inactive, the user is logged out.
 */
const validateSession: Handle = async ({ event, resolve }) => {
  try {
    // Get the user from the request if available
    const authHeader = event.request.headers.get('authorization');
    
    if (!authHeader) {
      // No auth header, continue without validation
      return resolve(event);
    }

    // Extract JWT from Authorization header (Bearer <token>)
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return resolve(event);
    }

    // Get the user associated with this token
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user?.id) {
      // No valid user, continue
      return resolve(event);
    }
  
    // Check if user has at least one active session
    const { data: activeSessions, error } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      console.error('Session validation error:', error);
      return resolve(event);
    }

    // If no active sessions found, invalidate the session
    if (!activeSessions || activeSessions.length === 0) {
      // Sign out the user
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error('Sign out error during session validation:', signOutError);
      }
      // Redirect to root (login page)
      return redirect(302, '/');
    }
  } catch (err) {
    console.error('Unexpected error during session validation:', err);
  }

  return resolve(event);
};

export const handle = sequence(domainRouting, validateSession);

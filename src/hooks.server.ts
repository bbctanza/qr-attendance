import { sequence } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';

/**
 * Session validation hook
 * Checks if the current user's session is still active in the database.
 * If a session is marked as inactive, the user is logged out.
 */
async function validateSession({ event, resolve }) {
  const session = await event.locals.getSession?.();
  
  if (!session?.user?.id) {
    // No session, continue
    return resolve(event);
  }

  try {
    // Check if user has at least one active session
    const { data: activeSessions, error } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('user_id', session.user.id)
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
      // Redirect to login
      return redirect(302, '/login');
    }
  } catch (err) {
    console.error('Unexpected error during session validation:', err);
  }

  return resolve(event);
}

export const handle = sequence(validateSession);

import { supabase } from '$lib/supabase';

export interface UserSession {
  id: string;
  device_name: string;
  browser: string;
  ip_address: string;
  location: string;
  last_active: string;
  created_at: string;
  is_current?: boolean;
}

// Detect device and browser info
function getDeviceInfo() {
  const ua = navigator.userAgent;
  
  // Device detection
  let device = 'Unknown Device';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) device = 'Android Device';
  else if (/Mac/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows PC';
  else if (/Linux/.test(ua)) device = 'Linux';

  // Add more specific model info if available
  const iPhoneMatch = ua.match(/iPhone OS (\d+)_(\d+)/);
  if (iPhoneMatch) device = `iPhone (iOS ${iPhoneMatch[1]})`;
  
  // Browser detection
  let browser = 'Unknown Browser';
  if (/Chrome\//.test(ua) && !/Edge|Edg\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Edge|Edg\//.test(ua)) browser = 'Edge';
  else if (/Opera|OPR\//.test(ua)) browser = 'Opera';

  const versionMatch = ua.match(/(?:Chrome|Safari|Firefox|Version|Edge)\/(\d+)/);
  if (versionMatch) {
    browser += ` ${versionMatch[1]}`;
  }

  return { device, browser };
}

// Get IP and location (requires backend API or service)
async function getIpAndLocation() {
  try {
    // Using a free IP geolocation API
    const response = await fetch('https://ipapi.co/json/', { method: 'GET' });
    const data = await response.json();
    
    return {
      ip_address: data.ip || 'Unknown',
      location: `${data.city || 'Unknown'}, ${data.country_name || 'Unknown'}`
    };
  } catch {
    return {
      ip_address: 'Unknown',
      location: 'Unknown Location'
    };
  }
}

// Create a new session record
export async function createSession() {
  try {
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('User not authenticated');
      return null;
    }

    const { device, browser } = getDeviceInfo();
    const { ip_address, location } = await getIpAndLocation();
    
    const { data, error } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: user.id,
        device_name: device,
        browser: browser,
        ip_address: ip_address,
        location: location
      }])
      .select()
      .single();

    if (error) {
      console.error('Failed to create session:', error);
      return null;
    }

    return data as UserSession;
  } catch (e) {
    console.error('Error creating session:', e);
    return null;
  }
}

// Get all user sessions
export async function getUserSessions(): Promise<UserSession[]> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('User not authenticated');
      return [];
    }

    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false });

    if (error) {
      console.error('Failed to fetch sessions:', error);
      return [];
    }

    // Mark the current session (most recent)
    const sessions = (data || []) as UserSession[];
    if (sessions.length > 0) {
      sessions[0].is_current = true;
    }

    return sessions;
  } catch (e) {
    console.error('Error fetching sessions:', e);
    return [];
  }
}

// Delete a specific session
export async function deleteSession(sessionId: string) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('User not authenticated');
      return false;
    }

    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to delete session:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error deleting session:', e);
    return false;
  }
}

// Delete all sessions except current
export async function deleteAllOtherSessions() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('User not authenticated');
      return false;
    }

    // Get all sessions
    const { data: sessions, error: fetchError } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch sessions:', fetchError);
      return false;
    }

    if (!sessions || sessions.length <= 1) {
      return true; // Nothing to delete
    }

    // Delete all except the first (current) one
    const idsToDelete = sessions.slice(1).map((s: { id: string }) => s.id);

    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', user.id)
      .in('id', idsToDelete);

    if (error) {
      console.error('Failed to delete sessions:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error deleting sessions:', e);
    return false;
  }
}

// Update last_active for current session
export async function updateSessionActivity(sessionId: string) {
  try {
    const { error } = await supabase
      .from('user_sessions')
      .update({ last_active: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) {
      console.error('Failed to update session activity:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error updating session activity:', e);
    return false;
  }
}

// Format relative time (e.g., "2 hours ago")
export function formatLastActive(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diff = now.getTime() - then.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return then.toLocaleDateString();
}

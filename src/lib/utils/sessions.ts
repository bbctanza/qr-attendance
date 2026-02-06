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
    
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: user.id,
        device_name: device,
        browser: browser,
        ip_address: ip_address,
        location: location,
        last_active: now
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
      .eq('is_active', true)
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

// Delete a specific session (mark as inactive)
export async function deleteSession(sessionId: string) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('User not authenticated');
      return false;
    }

    const { error } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
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

// Delete all sessions except current (mark as inactive)
export async function deleteAllOtherSessions() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('User not authenticated');
      return false;
    }

    // Get all active sessions
    const { data: sessions, error: fetchError } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('last_active', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch sessions:', fetchError);
      return false;
    }

    if (!sessions || sessions.length <= 1) {
      return true; // Nothing to delete
    }

    // Mark all except the first (current) one as inactive
    const idsToDelete = sessions.slice(1).map((s: { id: string }) => s.id);

    const { error } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
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

// Get current session ID from localStorage (or generate identifier)
export function getCurrentSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('currentSessionId');
}

// Set current session ID in localStorage
export function setCurrentSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('currentSessionId', sessionId);
}

// Update current session activity
export async function updateCurrentSessionActivity(): Promise<boolean> {
  try {
    const sessionId = getCurrentSessionId();
    if (!sessionId) {
      console.warn('No current session ID found');
      return false;
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('User not authenticated');
      return false;
    }

    const { error } = await supabase
      .from('user_sessions')
      .update({ last_active: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to update current session activity:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error updating current session activity:', e);
    return false;
  }
}

// Locale-specific translations for relative time
const translations: Record<string, Record<string, string>> = {
  en: {
    now: 'Now',
    m_ago: 'm ago',
    h_ago: 'h ago',
    d_ago: 'd ago',
    invalid: 'Invalid date'
  },
  es: {
    now: 'Ahora',
    m_ago: 'hace {0}m',
    h_ago: 'hace {0}h',
    d_ago: 'hace {0}d',
    invalid: 'Fecha inválida'
  },
  fr: {
    now: 'À l\'instant',
    m_ago: 'il y a {0}m',
    h_ago: 'il y a {0}h',
    d_ago: 'il y a {0}d',
    invalid: 'Date invalide'
  },
  de: {
    now: 'Jetzt',
    m_ago: 'vor {0}m',
    h_ago: 'vor {0}h',
    d_ago: 'vor {0}d',
    invalid: 'Ungültiges Datum'
  }
};

// Get current locale from browser or fallback to 'en'
function getCurrentLocale(): string {
  if (typeof window === 'undefined') return 'en';
  return (navigator.language || 'en').split('-')[0];
}

// Format relative time with locale support and proper timezone handling
export function formatLastActive(timestamp: string | null | undefined, locale?: string): string {
  if (!timestamp) return 'Unknown';
  
  try {
    const currentLocale = locale || getCurrentLocale();
    const trans = translations[currentLocale] || translations['en'];
    
    // Parse timestamp - handle both ISO and PostgreSQL formats
    let then: Date;
    
    // If timestamp doesn't have timezone info, assume it's UTC
    if (timestamp.includes('T')) {
      // ISO format: 2026-02-06T13:32:28.621Z or 2026-02-06T13:32:28.621
      then = new Date(timestamp.endsWith('Z') ? timestamp : timestamp + 'Z');
    } else {
      // PostgreSQL format: 2026-02-06 13:32:28.621
      // Replace space with T and append Z for UTC
      const isoString = timestamp.replace(' ', 'T') + 'Z';
      then = new Date(isoString);
    }
    
    // Handle invalid dates
    if (isNaN(then.getTime())) {
      console.warn('Invalid timestamp:', timestamp);
      return trans.invalid;
    }
    
    const now = new Date();
    const diff = now.getTime() - then.getTime();
    
    // Handle negative differences (clock skew)
    if (diff < 0) {
      return trans.now;
    }

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return trans.now;
    if (minutes < 60) return trans.m_ago.replace('{0}', minutes.toString());
    if (hours < 24) return trans.h_ago.replace('{0}', hours.toString());
    if (days < 7) return trans.d_ago.replace('{0}', days.toString());
    
    // For older dates, show localized date
    return then.toLocaleDateString(currentLocale);
  } catch (e) {
    console.error('Error formatting last active:', e, timestamp);
    return 'Unknown';
  }
}

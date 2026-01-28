export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Group {
  group_id: number;
  group_code: string;
  name: string | null;
  metadata: Json;
  created_at?: string;
}

export interface Member {
  member_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  group_id: number | null;
  metadata: Json;
  created_at?: string;
  // Joined fields
  groups?: Group | null;
}

export interface EventType {
  event_type_id: number;
  name: string;
  day_of_week: number;
  start_time: string; // Time string HH:MM:SS
  end_time: string;
  is_active: boolean;
  created_at?: string;
}

export type EventStatus = 'upcoming' | 'ongoing' | 'completed';

export interface AttendanceEvent {
  event_id: number;
  event_type_id: number | null;
  event_name: string;
  event_date: string; // Date string YYYY-MM-DD
  start_datetime: string; // ISO timestamp
  end_datetime: string; // ISO timestamp
  status: EventStatus;
  is_custom: boolean;
  description: string | null;
  metadata: Json;
  created_at?: string;
}

export interface AttendanceScan {
  scan_id: string;
  member_id: string;
  scan_datetime: string;
  event_id: number;
  created_at?: string;
}

export interface AttendancePresent {
  present_id: number;
  scan_id: string | null;
  member_id: string;
  event_id: number;
  scan_datetime: string;
  created_at?: string;
}

export interface AttendanceAbsent {
  absent_id: number;
  member_id: string;
  event_id: number;
  created_at?: string;
}

// Joined Types for API Responses
export interface AttendanceScanWithMember extends AttendanceScan {
  members: {
    first_name: string;
    last_name: string;
    member_id: string;
  };
}

export interface AttendancePresentWithMember extends AttendancePresent {
  members: {
    first_name: string;
    last_name: string;
    member_id: string;
  };
}

export interface AttendanceHistoryWithEvent extends AttendancePresent {
  events: {
    event_name: string;
    event_date: string;
  };
}

-- ============================================
-- QR ATTENDANCE SYSTEM - GENERIC TEMPLATE SCHEMA
-- ============================================
-- Description: A modular, generic schema for any QR-based attendance system.
-- No system-specific seed data included.

-- 1. CLEAN SLATE
DROP TABLE IF EXISTS attendance_absent CASCADE;
DROP TABLE IF EXISTS attendance_present CASCADE;
DROP TABLE IF EXISTS attendance_scans CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS event_types CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP VIEW IF EXISTS members_with_groups CASCADE;
DROP FUNCTION IF EXISTS process_event_attendance(BIGINT);
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- 2. AUTH & PROFILES
-- Role type for access control
CREATE TYPE user_role AS ENUM ('developer', 'admin', 'staff');

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'staff' NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'staff'); -- Default to staff
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. CORE TABLES

-- Table: groups (Generic grouping: Classes, Care Groups, Departments, etc.)
CREATE TABLE groups (
    group_id SERIAL PRIMARY KEY,
    group_code TEXT NOT NULL UNIQUE,      -- Identifier for the group (e.g., "10-A", "CG-1")
    name TEXT,                            -- Descriptive name
    metadata JSONB DEFAULT '{}',          -- Flexible storage for extra group info
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table: members (People being tracked: Students, Members, Employees)
CREATE TABLE members (
    member_id TEXT PRIMARY KEY,           -- Unique identifier (used in QR code)
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    group_id INT REFERENCES groups(group_id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',          -- Flexible storage (e.g., address, phone, grade)
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table: event_types (Templates for recurring events)
CREATE TABLE event_types (
    event_type_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,                   -- e.g., "Weekly Meeting", "Class Period"
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',          -- Flexible storage (e.g., location)
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table: events (Specific instances of attendance tracking)
CREATE TABLE events (
    event_id BIGSERIAL PRIMARY KEY,
    event_type_id INTEGER REFERENCES event_types(event_type_id) ON DELETE SET NULL,
    event_name VARCHAR(255) NOT NULL,
    event_date DATE NOT NULL,
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed')),
    is_custom BOOLEAN DEFAULT FALSE,
    description TEXT,
    metadata JSONB DEFAULT '{}',          -- e.g., location, guest speaker, teacher
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_date_status ON events(event_date, status);

-- Table: attendance_scans (Temporary holding for real-time scanning)
CREATE TABLE attendance_scans (
    scan_id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(member_id) ON DELETE CASCADE,
    scan_datetime TIMESTAMP NOT NULL,
    event_id BIGINT REFERENCES events(event_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table: attendance_present (Historical record of attendance)
CREATE TABLE attendance_present (
    present_id BIGSERIAL PRIMARY KEY,
    scan_id TEXT,
    member_id TEXT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    scan_datetime TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT present_unique UNIQUE (member_id, event_id)
);

-- Table: attendance_absent (Historical record of absence)
CREATE TABLE attendance_absent (
    absent_id BIGSERIAL PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT absent_unique UNIQUE (member_id, event_id)
);

-- 3. VIEWS

-- View: members_with_groups
CREATE OR REPLACE VIEW members_with_groups AS
SELECT 
    m.member_id,
    m.first_name,
    m.middle_name,
    m.last_name,
    m.group_id,
    g.group_code,
    g.name as group_name,
    m.metadata,
    m.created_at
FROM members m
LEFT JOIN groups g ON m.group_id = g.group_id;

-- 4. FUNCTIONS

-- Function: process_event_attendance
-- Migrates temporary scans to permanent records and identifies absentees
CREATE OR REPLACE FUNCTION process_event_attendance(p_event_id BIGINT)
RETURNS void AS $$
BEGIN
    -- 1. Move scans to attendance_present
    INSERT INTO attendance_present (
        scan_id,
        member_id,
        event_id,
        scan_datetime,
        created_at
    )
    SELECT 
        scan_id,
        member_id,
        event_id,
        scan_datetime,
        NOW()
    FROM attendance_scans
    WHERE event_id = p_event_id
    ON CONFLICT (member_id, event_id) DO NOTHING;

    -- 2. Identify absentees (Members in the system not present at this event)
    INSERT INTO attendance_absent (
        member_id,
        event_id,
        created_at
    )
    SELECT 
        m.member_id,
        p_event_id,
        NOW()
    FROM members m
    WHERE NOT EXISTS (
        SELECT 1 
        FROM attendance_present ap
        WHERE ap.member_id = m.member_id
        AND ap.event_id = p_event_id
    )
    ON CONFLICT (member_id, event_id) DO NOTHING;

    -- 3. Cleanup temporary scans
    DELETE FROM attendance_scans
    WHERE event_id = p_event_id;

END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_present ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_absent ENABLE ROW LEVEL SECURITY;

-- Helper Function: Check User Role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 5.1 Profiles Policies
CREATE POLICY "Developers have full access to profiles" 
ON profiles FOR ALL TO authenticated USING (get_user_role() = 'developer');

CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- 5.2 Groups Policies
CREATE POLICY "Developer/Admin full access to groups"
ON groups FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));

CREATE POLICY "Staff can view groups"
ON groups FOR SELECT TO authenticated USING (get_user_role() = 'staff');

-- 5.3 Members Policies
CREATE POLICY "Developer/Admin full access to members"
ON members FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));

CREATE POLICY "Staff can view members"
ON members FOR SELECT TO authenticated USING (get_user_role() = 'staff');

-- 5.4 Event Types Policies
CREATE POLICY "Developer/Admin full access to event_types"
ON event_types FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff'));

-- 5.5 Events Policies
CREATE POLICY "Developer/Admin full access to events"
ON events FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff'));

-- 5.6 Attendance Scans Policies (The scanning logic)
CREATE POLICY "Developer/Admin full access to scans"
ON attendance_scans FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));

CREATE POLICY "Staff can insert scans"
ON attendance_scans FOR INSERT TO authenticated WITH CHECK (get_user_role() = 'staff');

CREATE POLICY "Staff can view scans"
ON attendance_scans FOR SELECT TO authenticated USING (get_user_role() = 'staff');

-- 5.7 Attendance History (Present/Absent)
CREATE POLICY "Developer/Admin full access to history"
ON attendance_present FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));

CREATE POLICY "Developer/Admin full access to absent history"
ON attendance_absent FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));

CREATE POLICY "Staff can view history"
ON attendance_present FOR SELECT TO authenticated USING (get_user_role() = 'staff');

CREATE POLICY "Staff can view absent history"
ON attendance_absent FOR SELECT TO authenticated USING (get_user_role() = 'staff');

-- ============================================
-- 6. SYSTEM SETTINGS
-- ============================================
-- A single row table to store global configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY DEFAULT 1, -- Only one row allowed
    site_name TEXT DEFAULT 'Scan-in System',
    primary_color TEXT DEFAULT '#275032',
    qr_header_title TEXT DEFAULT 'Organization Name',
    qr_subheader_title TEXT DEFAULT 'Tagline or Subtitle',
    qr_card_color TEXT DEFAULT '#275032',
    qr_background_image TEXT DEFAULT '',
    CONSTRAINT one_row_only CHECK (id = 1)
);

-- Enable RLS for settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can view settings
CREATE POLICY "Everyone can view settings"
ON system_settings FOR SELECT TO authenticated, anon USING (true);

-- Only admins/devs/staff can insert
CREATE POLICY "Admins can insert settings"
ON system_settings FOR INSERT TO authenticated 
WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));

-- Only admins/devs/staff can update
CREATE POLICY "Admins can update settings"
ON system_settings FOR UPDATE TO authenticated 
USING (get_user_role() IN ('developer', 'admin', 'staff'))
WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));

-- Only developers can delete (generally shouldn't delete the only row)
CREATE POLICY "Developers can delete settings"
ON system_settings FOR DELETE TO authenticated 
USING (get_user_role() = 'developer');

-- Insert default row if not exists
INSERT INTO system_settings (id, site_name, primary_color, qr_header_title, qr_subheader_title, qr_card_color, qr_background_image)
VALUES (1, 'Scan-in System', '#275032', 'Organization Name', 'Tagline or Subtitle', '#275032', '')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 7. INITIAL SETUP INSTRUCTIONS
-- ============================================
/*
  HOW TO SET UP YOUR FIRST DEVELOPER:
  1. Sign up via the SvelteKit UI or Supabase Dashboard.
  2. Run the following SQL in the Supabase SQL Editor:
     
     UPDATE profiles SET role = 'developer' WHERE email = 'your-email@example.com';
*/

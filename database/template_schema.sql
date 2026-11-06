-- ============================================
-- QR ATTENDANCE SYSTEM - COMPLETE TEMPLATE SCHEMA
-- ============================================
-- Description: A modular, generic schema for any QR-based attendance system.
-- Includes full functionality for:
-- - Automated status updates (Recurring Events)
-- - Developer Tools (Mock Time, Force Process)
-- - System Settings (Timezones, Branding)

-- 1. CLEAN SLATE
-- Drop Objects (Tables, Types, Functions, Views) to allow full reset

-- Tables
DROP TABLE IF EXISTS attendance_absent CASCADE;
DROP TABLE IF EXISTS attendance_present CASCADE;
DROP TABLE IF EXISTS attendance_scans CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS event_types CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- Views
DROP VIEW IF EXISTS members_with_groups CASCADE;

-- Functions
DROP FUNCTION IF EXISTS process_event_attendance(BIGINT);
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_event_statuses(TIMESTAMP);
DROP FUNCTION IF EXISTS update_event_statuses(); -- Drop older signature if exists
DROP FUNCTION IF EXISTS generate_recurring_events(DATE, DATE);
DROP FUNCTION IF EXISTS clear_attendance_history();
DROP FUNCTION IF EXISTS force_process_all_events();

-- Types
-- (Note: Types often depend on usage, CASCADE usually handles them if dropping tables)

-- 2. AUTH & PROFILES
-- Role type for access control
DROP TYPE IF EXISTS user_role;
CREATE TYPE user_role AS ENUM ('developer', 'admin', 'staff', 'guest');

DROP TYPE IF EXISTS invitation_status;
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

DROP TYPE IF EXISTS account_status;
CREATE TYPE account_status AS ENUM ('active', 'suspended');

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'staff' NOT NULL,
    -- Suspension: the reversible alternative to deleting an account outright.
    status account_status NOT NULL DEFAULT 'active',
    suspended_at TIMESTAMPTZ,
    suspended_reason TEXT,
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_profiles_role_status ON profiles (role, status);

-- Table: invitations (server-owned record of who was invited, as what, by whom)
--
-- This table is what makes a new account's role trustworthy. The role used to be read out
-- of raw_user_meta_data, which the user it belongs to can write - so anything reaching
-- auth.users with chosen metadata could mint an administrator.
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'staff',
    status invitation_status NOT NULL DEFAULT 'pending',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Denormalised so deleting the inviter does not erase who sent the invitation.
    invited_by_email TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resend_count INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live invitation per address; accepted and revoked history is kept.
CREATE UNIQUE INDEX idx_invitations_one_pending_per_email
    ON invitations (lower(email)) WHERE status = 'pending';
CREATE INDEX idx_invitations_email_lower ON invitations (lower(email));
CREATE INDEX idx_invitations_status ON invitations (status, created_at DESC);

-- Trigger to create profile on signup. The role is resolved from the invitations table,
-- never from user-supplied metadata; anything uninvited lands as 'guest'.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    invitation   public.invitations%ROWTYPE;
    granted_role user_role;
BEGIN
    SELECT * INTO invitation
    FROM public.invitations
    WHERE lower(email) = lower(new.email)
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    granted_role := COALESCE(invitation.role, 'guest'::user_role);

    INSERT INTO public.profiles (id, email, full_name, role, invited_by)
    VALUES (
        new.id,
        new.email,
        new.raw_user_meta_data->>'full_name',
        granted_role,
        invitation.invited_by
    );

    -- Not marked accepted here: inviteUserByEmail() creates the auth row when the mail is
    -- *sent*, so this fires long before anyone clicks the link. Acceptance is recorded by
    -- mark_invitation_accepted() when setup completes, which is what keeps an invitation
    -- observably pending so it can be resent or revoked.
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if trigger exists before creating to avoid errors in some restoration scenarios (though DROP above handles cascade)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION mark_invitation_accepted()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.onboarding_completed IS TRUE AND OLD.onboarding_completed IS DISTINCT FROM TRUE THEN
        UPDATE public.invitations
        SET status = 'accepted',
            accepted_at = NOW(),
            accepted_user_id = NEW.id
        WHERE lower(email) = lower(NEW.email)
          AND status = 'pending';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_onboarding_completed ON profiles;
CREATE TRIGGER on_profile_onboarding_completed
    AFTER UPDATE OF onboarding_completed ON profiles
    FOR EACH ROW EXECUTE FUNCTION mark_invitation_accepted();

-- RLS WITH CHECK cannot compare against OLD, so column-level immutability needs a trigger.
-- Without this, "Users can update their own profile" lets any user set their own role.
CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER AS $$
DECLARE
    jwt_role TEXT;
BEGIN
    jwt_role := COALESCE(
        current_setting('request.jwt.claims', true)::json->>'role',
        current_user
    );

    IF jwt_role IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'profiles.role cannot be changed directly. Use the access service.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'profiles.status cannot be changed directly. Use the access service.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_privileged_update ON profiles;
CREATE TRIGGER on_profile_privileged_update
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_columns();

CREATE OR REPLACE FUNCTION expire_stale_invitations()
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE public.invitations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at <= NOW();
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Table: user_sessions (Track active user sessions)
DROP TABLE IF EXISTS user_sessions CASCADE;
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- `session_id` claim from the access-token JWT: the device's stable identity
    auth_session_id UUID,
    device_name TEXT DEFAULT 'Unknown Device',
    browser TEXT DEFAULT 'Unknown Browser',
    ip_address TEXT,
    location TEXT DEFAULT 'Unknown Location',
    is_active BOOLEAN DEFAULT TRUE,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_last_active ON user_sessions(last_active);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_user_active ON user_sessions(user_id, is_active);
-- One row per auth session. Postgres allows many NULLs here, and a non-partial index is
-- required for the ON CONFLICT inference that registerSession() upserts against.
CREATE UNIQUE INDEX idx_user_sessions_auth_session_id ON user_sessions(auth_session_id);

-- Realtime delivers the revocation kick to the target device.
-- FULL so change payloads carry user_id for RLS filtering on every event type.
ALTER TABLE user_sessions REPLICA IDENTITY FULL;

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
    is_recurring BOOLEAN DEFAULT FALSE,
    description TEXT,
    metadata JSONB DEFAULT '{}',          -- e.g., location, guest speaker, teacher, auto_complete_error
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_date_status ON events(event_date, status);
CREATE INDEX idx_events_ongoing ON events(status) WHERE status = 'ongoing';

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

-- Table: system_settings (One row only)
CREATE TABLE system_settings (
    id INT PRIMARY KEY DEFAULT 1,
    site_name TEXT DEFAULT 'Scan-in System',
    primary_color TEXT DEFAULT '#275032',
    timezone TEXT DEFAULT 'Asia/Manila',
    qr_header_title TEXT DEFAULT 'Organization Name',
    qr_subheader_title TEXT DEFAULT 'Tagline or Subtitle',
    qr_card_color TEXT DEFAULT '#275032',
    qr_background_image TEXT DEFAULT '',
    CONSTRAINT one_row_only CHECK (id = 1)
);

-- 4. VIEWS

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

-- 5. BUSINESS LOGIC FUNCTIONS

-- Function A: Process Attendance (Move from scans -> history)
CREATE OR REPLACE FUNCTION process_event_attendance(p_event_id BIGINT)
RETURNS void AS $$
DECLARE
    v_record_absents BOOLEAN;
BEGIN
    -- Check if this event should record absents from metadata
    SELECT COALESCE((metadata->>'record_absents')::BOOLEAN, true) INTO v_record_absents
    FROM events
    WHERE event_id = p_event_id;

    -- 1. Move scans to attendance_present
    INSERT INTO attendance_present (scan_id, member_id, event_id, scan_datetime, created_at)
    SELECT scan_id, member_id, event_id, scan_datetime, NOW()
    FROM attendance_scans
    WHERE event_id = p_event_id
    ON CONFLICT (member_id, event_id) DO NOTHING;

    -- 2. Identify absentees only if record_absents is true
    IF v_record_absents THEN
        INSERT INTO attendance_absent (member_id, event_id, created_at)
        SELECT m.member_id, p_event_id, NOW()
        FROM members m
        WHERE NOT EXISTS (
            SELECT 1 FROM attendance_present ap
            WHERE ap.member_id = m.member_id AND ap.event_id = p_event_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM attendance_absent aa
            WHERE aa.member_id = m.member_id AND aa.event_id = p_event_id
        )
        ON CONFLICT (member_id, event_id) DO NOTHING;
    END IF;

    -- 3. Cleanup scans
    DELETE FROM attendance_scans WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function B: Auto Update Statuses (Supports Mock Time)
CREATE OR REPLACE FUNCTION update_event_statuses(p_now TIMESTAMP DEFAULT NOW())
RETURNS void AS $$
DECLARE
    r RECORD;
    current_ts TIMESTAMP;
    ongoing_recurring_count INTEGER;
    ongoing_custom_count INTEGER;
BEGIN
    current_ts := p_now;

    -- 1. Handle events moving to 'completed' (Cleanup & Archive)
    FOR r IN 
        SELECT event_id, event_name 
        FROM events 
        WHERE status != 'completed' 
        AND current_ts > end_datetime 
    LOOP
        BEGIN
            PERFORM process_event_attendance(r.event_id);
            UPDATE events SET status = 'completed' WHERE event_id = r.event_id;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to process event %: %', r.event_id, SQLERRM;
            UPDATE events 
            SET status = 'completed',
                metadata = jsonb_set(COALESCE(metadata, '{}'), '{auto_complete_error}', to_jsonb(SQLERRM))
            WHERE event_id = r.event_id;
        END;
    END LOOP;

    -- 2. Handle simultaneous event prevention: Mark non-recurring as 'completed' if recurring exists
    SELECT COUNT(*) INTO ongoing_recurring_count
    FROM events
    WHERE status IN ('ongoing', 'upcoming')
    AND current_ts >= start_datetime
    AND current_ts <= end_datetime
    AND is_recurring = TRUE;

    IF ongoing_recurring_count > 0 THEN
        -- Cancel conflicting non-recurring events
        UPDATE events
        SET status = 'completed'
        WHERE is_recurring = FALSE
        AND status IN ('ongoing', 'upcoming')
        AND current_ts >= start_datetime
        AND current_ts <= end_datetime
        AND NOT EXISTS (
            SELECT 1 FROM events e2
            WHERE e2.is_recurring = TRUE
            AND e2.status IN ('ongoing', 'upcoming')
            AND current_ts >= e2.start_datetime
            AND current_ts <= e2.end_datetime
        );
    END IF;

    -- 3. Handle events moving to 'ongoing'
    UPDATE events
    SET status = 'ongoing'
    WHERE status = 'upcoming'
    AND current_ts >= start_datetime 
    AND current_ts <= end_datetime;

    -- 4. Handle correction (ongoing -> upcoming if time rewound)
    UPDATE events
    SET status = 'upcoming'
    WHERE status = 'ongoing'
    AND current_ts < start_datetime;
END;
$$ LANGUAGE plpgsql;

-- Function C: Generate Recursive Events
CREATE OR REPLACE FUNCTION generate_recurring_events(
    start_date DATE,
    end_date DATE
)
RETURNS INTEGER AS $$
DECLARE
    current_d DATE;
    dow INTEGER;
    et RECORD;
    events_created INTEGER := 0;
    event_start TIMESTAMP;
    event_end TIMESTAMP;
BEGIN
    current_d := start_date;

    WHILE current_d <= end_date LOOP
        dow := EXTRACT(DOW FROM current_d);

        FOR et IN SELECT * FROM event_types WHERE is_active = TRUE AND day_of_week = dow LOOP
            event_start := current_d + et.start_time;
            event_end := current_d + et.end_time;
            
            -- Handle overnight events
            IF et.end_time < et.start_time THEN
                event_end := event_end + INTERVAL '1 day';
            END IF;

            -- Prevent duplicates
            IF NOT EXISTS (
                SELECT 1 FROM events 
                WHERE event_type_id = et.event_type_id 
                AND event_date = current_d
            ) THEN
                INSERT INTO events (
                    event_type_id, event_name, event_date, 
                    start_datetime, end_datetime, 
                    status, is_custom, is_recurring, description, metadata
                ) VALUES (
                    et.event_type_id, et.name, current_d,
                    event_start, event_end,
                    'upcoming', FALSE, TRUE, 'Automatically generated from recurring schedule', et.metadata
                );
                events_created := events_created + 1;
            END IF;
        END LOOP;
        current_d := current_d + 1;
    END LOOP;

    RETURN events_created;
END;
$$ LANGUAGE plpgsql;

-- Function D: Developer Tools - Clear History
CREATE OR REPLACE FUNCTION clear_attendance_history(passcode TEXT DEFAULT NULL)
RETURNS void AS $$
DECLARE
    curr_role user_role;
BEGIN
    SELECT role INTO curr_role FROM profiles WHERE id = auth.uid();
    IF curr_role != 'developer' THEN 
        RAISE EXCEPTION 'Access denied: Developer role required.'; 
    END IF;

    IF passcode IS NULL OR passcode != 'WIPE_ATTENDANCE_HISTORY_CONFIRMED' THEN
        RAISE EXCEPTION 'Security restriction: Invalid or missing wipe security passcode.';
    END IF;

    DELETE FROM attendance_present;
    DELETE FROM attendance_absent;
    DELETE FROM attendance_scans;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function E: Developer Tools - Force Process All
CREATE OR REPLACE FUNCTION force_process_all_events()
RETURNS void AS $$
DECLARE
    curr_role user_role;
    r RECORD;
BEGIN
    SELECT role INTO curr_role FROM profiles WHERE id = auth.uid();
    IF curr_role != 'developer' THEN RAISE EXCEPTION 'Access denied'; END IF;

    FOR r IN SELECT event_id FROM events WHERE status = 'completed' LOOP
        INSERT INTO attendance_absent (member_id, event_id, created_at)
        SELECT m.member_id, r.event_id, NOW()
        FROM members m
        WHERE NOT EXISTS (SELECT 1 FROM attendance_present ap WHERE ap.member_id = m.member_id AND ap.event_id = r.event_id)
        AND NOT EXISTS (SELECT 1 FROM attendance_absent aa WHERE aa.member_id = m.member_id AND aa.event_id = r.event_id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function F: Prevent Simultaneous Non-Recurring Events
CREATE OR REPLACE FUNCTION check_simultaneous_events()
RETURNS TRIGGER AS $$
DECLARE
    conflict_count INTEGER;
    recurring_count INTEGER;
BEGIN
    -- Check if this is a non-recurring event
    IF NEW.is_recurring = FALSE THEN
        -- Check if any recurring event overlaps
        SELECT COUNT(*) INTO recurring_count
        FROM events
        WHERE event_id != NEW.event_id
        AND is_recurring = TRUE
        AND status IN ('upcoming', 'ongoing')
        AND (
            (NEW.start_datetime < end_datetime AND NEW.end_datetime > start_datetime)
        );

        IF recurring_count > 0 THEN
            RAISE EXCEPTION 'Cannot create non-recurring event during recurring event time';
        END IF;

        -- Check if any other non-recurring event overlaps
        SELECT COUNT(*) INTO conflict_count
        FROM events
        WHERE event_id != NEW.event_id
        AND is_recurring = FALSE
        AND status IN ('upcoming', 'ongoing')
        AND (
            (NEW.start_datetime < end_datetime AND NEW.end_datetime > start_datetime)
        );

        IF conflict_count > 0 THEN
            RAISE EXCEPTION 'Only one non-recurring event can be active at a time';
        END IF;
    ELSE
        -- For recurring events, check if any non-recurring overlaps
        DELETE FROM events
        WHERE is_recurring = FALSE
        AND status IN ('upcoming', 'ongoing')
        AND (
            (NEW.start_datetime < end_datetime AND NEW.end_datetime > start_datetime)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_simultaneous_events ON events;
CREATE TRIGGER trigger_check_simultaneous_events
BEFORE INSERT OR UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION check_simultaneous_events();


-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_present ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_absent ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Helper Function
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- is_admin(): the authorization predicate, in one place. SECURITY DEFINER so policies on
-- profiles can call it without recursing through profiles' own RLS.
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = uid AND role IN ('admin', 'developer') AND status = 'active'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Profiles Policies
-- Authenticated only: `anon` used to be able to read every staff email address, and no
-- public route reads profiles.
CREATE POLICY "Authenticated users can view profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Developers have full access to profiles" ON profiles FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'developer'));

-- Invitations Policies
-- Read-only, for admins. Writes have no policy on purpose: they all go through the access
-- edge function on the service role, which is where authorization and step-up live.
CREATE POLICY "Admins can view invitations" ON invitations FOR SELECT TO authenticated USING (public.is_admin());

-- Groups Policies
CREATE POLICY "Developer/Admin full access to groups" ON groups FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));
CREATE POLICY "Staff and Guest can view groups" ON groups FOR SELECT TO authenticated USING (get_user_role() IN ('staff', 'guest'));
CREATE POLICY "Staff can create and edit groups" ON groups FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Staff can update groups" ON groups FOR UPDATE TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff')) WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Staff can delete groups" ON groups FOR DELETE TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff'));

-- Members Policies
CREATE POLICY "Developer/Admin full access to members" ON members FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));
CREATE POLICY "Staff and Guest can view members" ON members FOR SELECT TO authenticated USING (get_user_role() IN ('staff', 'guest'));
CREATE POLICY "Staff can create members" ON members FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Staff can update members" ON members FOR UPDATE TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff')) WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Staff can delete members" ON members FOR DELETE TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff'));

-- Event Types Policies
CREATE POLICY "Developer/Admin full access to event_types" ON event_types FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Guest can view event_types" ON event_types FOR SELECT TO authenticated USING (get_user_role() = 'guest');

-- Events Policies
CREATE POLICY "Developer/Admin full access to events" ON events FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Guest can view events" ON events FOR SELECT TO authenticated USING (get_user_role() = 'guest');

-- Attendance Scans Policies
CREATE POLICY "Developer/Admin full access to scans" ON attendance_scans FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));
CREATE POLICY "Staff can insert scans" ON attendance_scans FOR INSERT TO authenticated WITH CHECK (get_user_role() = 'staff');
CREATE POLICY "Staff and Guest can view scans" ON attendance_scans FOR SELECT TO authenticated USING (get_user_role() IN ('staff', 'guest'));

-- Attendance History Policies
CREATE POLICY "Developer/Admin full access to history" ON attendance_present FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));
CREATE POLICY "Developer/Admin full access to absent history" ON attendance_absent FOR ALL TO authenticated USING (get_user_role() IN ('developer', 'admin'));
CREATE POLICY "Staff and Guest can view history" ON attendance_present FOR SELECT TO authenticated USING (get_user_role() IN ('staff', 'guest'));
CREATE POLICY "Staff and Guest can view absent history" ON attendance_absent FOR SELECT TO authenticated USING (get_user_role() IN ('staff', 'guest'));

-- System Settings Policies
CREATE POLICY "Everyone can view settings" ON system_settings FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Staff and above can modify settings" ON system_settings FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Staff and above can update settings" ON system_settings FOR UPDATE TO authenticated USING (get_user_role() IN ('developer', 'admin', 'staff')) WITH CHECK (get_user_role() IN ('developer', 'admin', 'staff'));
CREATE POLICY "Developers can delete settings" ON system_settings FOR DELETE TO authenticated USING (get_user_role() = 'developer');

-- User Sessions Policies
CREATE POLICY "Users can view their own sessions" ON user_sessions FOR SELECT TO authenticated USING (user_id = auth.uid() OR get_user_role() IN ('developer', 'admin'));
CREATE POLICY "System can create sessions" ON user_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own sessions" ON user_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their own sessions" ON user_sessions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Publish user_sessions changes so a revoked device can sign itself out immediately.
-- The SELECT policy above is what filters the stream per user.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_sessions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication not found; enable Realtime for user_sessions in the dashboard';
END $$;

-- 7. STORAGE POLICIES
-- QR Background Image Storage Policies
CREATE POLICY "Allow authenticated upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'qr-background');

CREATE POLICY "Allow authenticated delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'qr-background');

CREATE POLICY "Allow authenticated read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'qr-background');

CREATE POLICY "Allow public read" ON storage.objects
FOR SELECT TO anon
USING (bucket_id = 'qr-background');

-- User Profile Avatar Storage Policies
CREATE POLICY "Allow authenticated upload avatars" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'user-profile');

CREATE POLICY "Allow authenticated delete avatars" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'user-profile');

CREATE POLICY "Allow authenticated read avatars" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'user-profile');

CREATE POLICY "Allow public read avatars" ON storage.objects
FOR SELECT TO anon
USING (bucket_id = 'user-profile');

-- 8. DEFAULT DATA
INSERT INTO system_settings (id, site_name, primary_color, timezone)
VALUES (1, 'Scan-in System', '#275032', 'Asia/Manila')
ON CONFLICT (id) DO NOTHING;

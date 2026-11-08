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

-- Every attendance query filters on event_id alone. The UNIQUE (member_id, event_id)
-- constraints on the two history tables lead with member_id, so they cannot serve it.
CREATE INDEX idx_attendance_present_event_id ON attendance_present (event_id);
CREATE INDEX idx_attendance_absent_event_id ON attendance_absent (event_id);
CREATE INDEX idx_attendance_scans_event_id ON attendance_scans (event_id);
CREATE INDEX idx_attendance_scans_event_time ON attendance_scans (event_id, scan_datetime DESC);
CREATE INDEX idx_attendance_present_scan_datetime ON attendance_present (scan_datetime DESC);

-- Supports per-group aggregation in get_group_attendance_summary().
CREATE INDEX idx_members_group_id ON members (group_id);

-- Table: attendance_scans (Temporary holding for real-time scanning)
--
-- UNIQUE (member_id, event_id): scan_member_transaction's own duplicate check is a
-- SELECT-then-INSERT, which two near-simultaneous scans of the same member (a camera and a
-- USB scanner both reading the same code, or simply the same QR presented twice in quick
-- succession) can both pass before either has inserted. This constraint is what actually makes
-- a second insert impossible - the function's check just gives it a clean error message.
CREATE TABLE attendance_scans (
    scan_id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(member_id) ON DELETE CASCADE,
    scan_datetime TIMESTAMP NOT NULL,
    event_id BIGINT REFERENCES events(event_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT attendance_scans_member_event_unique UNIQUE (member_id, event_id)
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

-- Function A2: Attendance summary for a date range (one row per completed event)
--
-- Without this both attendance pages counted in client loops: the history page fetched every
-- completed event ever, then issued two roster queries per event, and discarded nearly all of
-- it to render a single month.
-- SECURITY DEFINER so the authorization check happens once here instead of as an RLS
-- predicate re-evaluated against every attendance row scanned. get_user_role() is
-- SECURITY DEFINER with a SET clause, so it can never be inlined and each call pays a
-- GUC save/restore; letting the policies call it per row cost 26 seconds and 1.6 million
-- buffer hits to return 35 rows. The check below reproduces those policies exactly - they
-- grant history SELECT to developer, admin, staff and guest alike, i.e. any signed-in user
-- with a profile - and the function returns only per-event counts, never identities.
CREATE OR REPLACE FUNCTION get_attendance_summary(p_from DATE, p_to DATE)
RETURNS TABLE (
    event_id BIGINT,
    event_name VARCHAR(255),
    event_date DATE,
    start_datetime TIMESTAMP,
    end_datetime TIMESTAMP,
    records_absents BOOLEAN,
    present_count INTEGER,
    absent_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    -- Evaluated once for the whole statement, rather than once per attendance row.
    WITH caller AS (
        SELECT get_user_role() AS caller_role
    ),
    scoped AS (
        SELECT
            e.event_id,
            e.event_name,
            e.event_date,
            e.start_datetime,
            e.end_datetime,
            -- Same expression as process_event_attendance(), so the page's idea of whether
            -- an event tracks absences cannot drift from the processor that wrote the rows.
            COALESCE((e.metadata->>'record_absents')::BOOLEAN, true) AS records_absents
        FROM events e
        WHERE (SELECT caller_role FROM caller) IS NOT NULL
          AND e.status = 'completed'
          AND e.event_date >= p_from
          AND e.event_date <= p_to
    )
    SELECT
        s.event_id,
        s.event_name,
        s.event_date,
        s.start_datetime,
        s.end_datetime,
        s.records_absents,
        -- Index lookups on this one event now that no policy predicate rides along.
        (SELECT COUNT(*) FROM attendance_present ap WHERE ap.event_id = s.event_id)::INTEGER,
        (SELECT COUNT(*) FROM attendance_absent aa WHERE aa.event_id = s.event_id)::INTEGER
    FROM scoped s
    ORDER BY s.event_date DESC, s.end_datetime DESC;
$$;

REVOKE ALL ON FUNCTION get_attendance_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_attendance_summary(DATE, DATE) TO authenticated;

-- Function A3: Per-group attendance for the analytics page
--
-- Same shape as get_attendance_summary above: SECURITY DEFINER with one authorization check
-- evaluated in a CTE, rather than letting the RLS policies re-check get_user_role() against
-- every scanned row. Internal columns are gid/cnt because the RETURNS TABLE output names are
-- in scope inside the body and an unqualified reference to one would be ambiguous.
CREATE OR REPLACE FUNCTION get_group_attendance_summary(
    p_from DATE,
    p_to DATE,
    p_event_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    group_id INTEGER,
    group_name TEXT,
    member_count INTEGER,
    present_count INTEGER,
    -- Number of completed events in scope. present_count counts a member once per event they
    -- attended, so a rate needs members * event_count as its denominator, not members alone.
    event_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH caller AS (
        -- Evaluated once for the whole statement.
        SELECT get_user_role() AS caller_role
    ),
    authorized AS (
        SELECT (SELECT caller_role FROM caller) IS NOT NULL AS ok
    ),
    scoped_events AS (
        -- A single event when asked for one, otherwise every completed event in range.
        SELECT e.event_id AS eid
        FROM events e
        WHERE (SELECT ok FROM authorized)
          AND e.status = 'completed'
          AND (
              (p_event_id IS NOT NULL AND e.event_id = p_event_id)
              OR
              (p_event_id IS NULL AND e.event_date >= p_from AND e.event_date <= p_to)
          )
    ),
    members_per_group AS (
        SELECT m.group_id AS gid, COUNT(*) AS cnt
        FROM members m
        WHERE (SELECT ok FROM authorized)
        GROUP BY m.group_id
    ),
    present_per_group AS (
        SELECT m.group_id AS gid, COUNT(*) AS cnt
        FROM attendance_present ap
        JOIN scoped_events se ON se.eid = ap.event_id
        JOIN members m ON m.member_id = ap.member_id
        WHERE (SELECT ok FROM authorized)
        GROUP BY m.group_id
    )
    SELECT
        g.group_id,
        COALESCE(NULLIF(g.name, ''), g.group_code)::TEXT,
        COALESCE(mg.cnt, 0)::INTEGER,
        COALESCE(pg.cnt, 0)::INTEGER,
        (SELECT COUNT(*) FROM scoped_events)::INTEGER
    FROM groups g
    LEFT JOIN members_per_group mg ON mg.gid = g.group_id
    LEFT JOIN present_per_group pg ON pg.gid = g.group_id
    WHERE (SELECT ok FROM authorized)

    UNION ALL

    -- Members belonging to no group would otherwise be invisible in a chart that claims to
    -- cover the congregation. Only emitted when such members exist.
    SELECT
        NULL::INTEGER,
        'No group'::TEXT,
        COALESCE((SELECT cnt FROM members_per_group WHERE gid IS NULL), 0)::INTEGER,
        COALESCE((SELECT cnt FROM present_per_group WHERE gid IS NULL), 0)::INTEGER,
        (SELECT COUNT(*) FROM scoped_events)::INTEGER
    WHERE (SELECT ok FROM authorized)
      AND EXISTS (SELECT 1 FROM members_per_group WHERE gid IS NULL)

    ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION get_group_attendance_summary(DATE, DATE, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_group_attendance_summary(DATE, DATE, BIGINT) TO authenticated;

-- Function A4: Check-ins grouped by minute of day, for the analytics histogram
--
-- An aggregate rather than letting the client select raw scan_datetime rows: that was a
-- direct table read, which goes through RLS - the path measured at 26 seconds in migration
-- 009 - and shipped thousands of rows so the browser could count them. Timezone conversion
-- belongs here too, since scan_datetime is a naive TIMESTAMP holding UTC.
CREATE OR REPLACE FUNCTION get_check_in_distribution(
    p_from DATE,
    p_to DATE,
    p_timezone TEXT DEFAULT 'UTC',
    p_event_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    hour INTEGER,
    minute INTEGER,
    check_ins INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH caller AS (
        SELECT get_user_role() AS caller_role
    ),
    authorized AS (
        SELECT (SELECT caller_role FROM caller) IS NOT NULL AS ok
    ),
    scoped AS (
        SELECT
            -- Naive UTC -> timestamptz -> naive local wall clock.
            (ap.scan_datetime AT TIME ZONE 'UTC') AT TIME ZONE p_timezone AS local_ts
        FROM attendance_present ap
        JOIN events e ON e.event_id = ap.event_id
        WHERE (SELECT ok FROM authorized)
          AND e.status = 'completed'
          AND (
              (p_event_id IS NOT NULL AND e.event_id = p_event_id)
              OR
              (p_event_id IS NULL AND e.event_date >= p_from AND e.event_date <= p_to)
          )
    )
    SELECT
        EXTRACT(HOUR FROM s.local_ts)::INTEGER,
        EXTRACT(MINUTE FROM s.local_ts)::INTEGER,
        COUNT(*)::INTEGER
    FROM scoped s
    GROUP BY 1, 2
    ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION get_check_in_distribution(DATE, DATE, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_check_in_distribution(DATE, DATE, TEXT, BIGINT) TO authenticated;

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
-- Defined with the overlap guards further down: it has to skip instances that would
-- collide, so it belongs next to the rule it respects.

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

-- Function F: Prevent overlapping events
--
-- One symmetric rule at each layer. The previous version only checked when the incoming
-- event was non-recurring, so recurring-vs-recurring collisions were never caught - and its
-- recurring branch silently DELETED overlapping non-recurring events rather than refusing
-- the write. A guard rail must never destroy the thing it is guarding.

-- ---------------------------------------------------------------------------
-- 1. events: no two active events may overlap
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_event_overlap()
RETURNS TRIGGER AS $$
DECLARE
    conflict RECORD;
BEGIN
    -- IS NOT DISTINCT FROM rather than =, so a NULL on either side compares as equal
    -- instead of yielding NULL and falling through to the check.
    IF TG_OP = 'UPDATE'
       AND NEW.start_datetime IS NOT DISTINCT FROM OLD.start_datetime
       AND NEW.end_datetime   IS NOT DISTINCT FROM OLD.end_datetime
       AND NEW.status         IS NOT DISTINCT FROM OLD.status
    THEN
        -- Nothing that bears on overlap changed. Let cascades, renames and metadata edits
        -- through untouched.
        RETURN NEW;
    END IF;

    IF NEW.end_datetime <= NEW.start_datetime THEN
        RAISE EXCEPTION 'Event must end after it starts (got % to %)',
            NEW.start_datetime, NEW.end_datetime
            USING ERRCODE = '22007',
                  HINT = 'Check the start and end times.';
    END IF;

    -- Only active events compete for the scanner's attention. Completed events are history
    -- and must stay editable even where they already overlap.
    IF NEW.status NOT IN ('upcoming', 'ongoing') THEN
        RETURN NEW;
    END IF;

    SELECT e.event_id, e.event_name, e.start_datetime, e.end_datetime
      INTO conflict
    FROM events e
    WHERE e.event_id IS DISTINCT FROM NEW.event_id
      AND e.status IN ('upcoming', 'ongoing')
      -- Half-open comparison: one event ending exactly as another begins is not an overlap.
      AND NEW.start_datetime < e.end_datetime
      AND NEW.end_datetime > e.start_datetime
    ORDER BY e.start_datetime
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'This event overlaps "%" (% to %)',
            conflict.event_name,
            to_char(conflict.start_datetime, 'Mon DD HH24:MI'),
            to_char(conflict.end_datetime, 'Mon DD HH24:MI')
            USING ERRCODE = '23P01',
                  HINT = 'Two events cannot run at the same time. Move one of them first.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_event_overlap
    BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION check_event_overlap();

-- ---------------------------------------------------------------------------
-- 2. event_types: no two active templates may overlap on the weekly clock
-- ---------------------------------------------------------------------------

-- A template occupies a span on a 7-day, 10080-minute clock. Expressing it as ranges is
-- what makes an overnight schedule comparable to a daytime one: a Sunday 23:30-03:00 slot
-- genuinely occupies late Sunday AND early Monday, and must collide with a Monday 02:00
-- template. Returns two ranges when the span wraps past the end of the week.
CREATE OR REPLACE FUNCTION event_type_week_ranges(p_dow INTEGER, p_start TIME, p_end TIME)
RETURNS SETOF int4range
LANGUAGE sql
IMMUTABLE
AS $$
    WITH bounds AS (
        SELECT
            p_dow * 1440 + (EXTRACT(EPOCH FROM p_start) / 60)::INT AS s,
            p_dow * 1440 + (EXTRACT(EPOCH FROM p_end) / 60)::INT
                -- end <= start means the schedule runs past midnight into the next day.
                + CASE WHEN p_end <= p_start THEN 1440 ELSE 0 END AS e
    )
    SELECT int4range(s, LEAST(e, 10080)) FROM bounds
    UNION ALL
    SELECT int4range(0, e - 10080) FROM bounds WHERE e > 10080;
$$;

CREATE OR REPLACE FUNCTION check_event_type_overlap()
RETURNS TRIGGER AS $$
DECLARE
    conflict RECORD;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.day_of_week IS NOT DISTINCT FROM OLD.day_of_week
       AND NEW.start_time  IS NOT DISTINCT FROM OLD.start_time
       AND NEW.end_time    IS NOT DISTINCT FROM OLD.end_time
       AND NEW.is_active   IS NOT DISTINCT FROM OLD.is_active
    THEN
        RETURN NEW;
    END IF;

    -- Deactivated templates generate nothing, so they cannot collide with anything.
    IF NEW.is_active IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    SELECT et.event_type_id, et.name, et.day_of_week, et.start_time, et.end_time
      INTO conflict
    FROM event_types et
    WHERE et.event_type_id IS DISTINCT FROM NEW.event_type_id
      AND et.is_active IS TRUE
      AND EXISTS (
          SELECT 1
          FROM event_type_week_ranges(NEW.day_of_week, NEW.start_time, NEW.end_time) AS nr,
               event_type_week_ranges(et.day_of_week, et.start_time, et.end_time) AS er
          WHERE nr && er
      )
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'This schedule overlaps "%" (% %-%)',
            conflict.name,
            to_char(DATE '2024-01-07' + conflict.day_of_week, 'Dy'),
            to_char(conflict.start_time, 'HH24:MI'),
            to_char(conflict.end_time, 'HH24:MI')
            USING ERRCODE = '23P01',
                  HINT = 'Two recurring schedules cannot run at the same time. Change the time, the day, or deactivate the other schedule.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_event_type_overlap ON event_types;
CREATE TRIGGER trigger_check_event_type_overlap
    BEFORE INSERT OR UPDATE ON event_types
    FOR EACH ROW EXECUTE FUNCTION check_event_type_overlap();

-- ---------------------------------------------------------------------------
-- 3. generate_recurring_events(): skip collisions instead of failing the run
-- ---------------------------------------------------------------------------

-- The trigger above would otherwise abort the whole generation run on the first collision,
-- which would stop the nightly job producing any events at all. Skipping the colliding
-- instance and carrying on keeps one bad schedule from taking down the calendar.
CREATE OR REPLACE FUNCTION generate_recurring_events(start_date DATE, end_date DATE)
RETURNS INTEGER AS $$
DECLARE
    current_d       DATE;
    dow             INTEGER;
    et              RECORD;
    events_created  INTEGER := 0;
    events_skipped  INTEGER := 0;
    event_start     TIMESTAMP;
    event_end       TIMESTAMP;
BEGIN
    current_d := start_date;

    WHILE current_d <= end_date LOOP
        dow := EXTRACT(DOW FROM current_d);

        FOR et IN SELECT * FROM event_types WHERE is_active = TRUE AND day_of_week = dow LOOP
            event_start := current_d + et.start_time;
            event_end := current_d + et.end_time;

            IF et.end_time <= et.start_time THEN
                event_end := event_end + INTERVAL '1 day';
            END IF;

            -- Already generated for this template and date.
            IF EXISTS (
                SELECT 1 FROM events
                WHERE event_type_id = et.event_type_id AND event_date = current_d
            ) THEN
                CONTINUE;
            END IF;

            -- Would collide with something already on the calendar.
            IF EXISTS (
                SELECT 1 FROM events x
                WHERE x.status IN ('upcoming', 'ongoing')
                  AND event_start < x.end_datetime
                  AND event_end > x.start_datetime
            ) THEN
                events_skipped := events_skipped + 1;
                CONTINUE;
            END IF;

            INSERT INTO events (
                event_type_id, event_name, event_date,
                start_datetime, end_datetime,
                status, is_custom, is_recurring, description, metadata
            ) VALUES (
                et.event_type_id, et.name, current_d,
                event_start, event_end,
                'upcoming', FALSE, TRUE,
                'Automatically generated from recurring schedule', et.metadata
            );
            events_created := events_created + 1;
        END LOOP;

        current_d := current_d + 1;
    END LOOP;

    IF events_skipped > 0 THEN
        RAISE NOTICE '% recurring event(s) skipped because they would overlap an existing event', events_skipped;
    END IF;

    RETURN events_created;
END;
$$ LANGUAGE plpgsql;



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
-- STABLE is load-bearing, not decoration. Without it this defaults to VOLATILE, and every
-- RLS policy below that calls it re-executes the lookup once PER ROW SCANNED - which was
-- enough to hit the statement timeout on any aggregate over the attendance history.
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

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

-- Publish attendance_scans so the live session view updates as people check in, rather than
-- showing whatever the count was when the page loaded.
-- REPLICA IDENTITY FULL so DELETE payloads carry event_id, which is what the client filters on.
ALTER TABLE attendance_scans REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_scans;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication not found; enable Realtime for attendance_scans in the dashboard';
END $$;

-- Publish events so the scan page (and kiosk standby on it) notices a new, started, or ended
-- event immediately instead of waiting out its own 30s poll.
ALTER TABLE events REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication not found; enable Realtime for events in the dashboard';
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

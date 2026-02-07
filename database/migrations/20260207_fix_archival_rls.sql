-- Migration: Fix Archival RLS Issues
-- Description: Update business logic functions to use SECURITY DEFINER so they can execute
--              bypass RLS when triggered by automation/staff members.

-- 1. Update process_event_attendance to bypass RLS during archival
CREATE OR REPLACE FUNCTION process_event_attendance(p_event_id BIGINT)
RETURNS void AS $$
BEGIN
    -- 1. Move scans to attendance_present
    INSERT INTO attendance_present (scan_id, member_id, event_id, scan_datetime, created_at)
    SELECT scan_id, member_id, event_id, scan_datetime, NOW()
    FROM attendance_scans
    WHERE event_id = p_event_id
    ON CONFLICT (member_id, event_id) DO NOTHING;

    -- 2. Identify absentees (members not in present table for this event)
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

    -- 3. Cleanup scans
    DELETE FROM attendance_scans WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update update_event_statuses to allow automation to modify event states
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update generate_recurring_events to allow authorized generation bypassing blockages
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Fix out-of-sync sequences for Primary Keys
-- This prevents "duplicate key value violates unique constraint" errors
SELECT SETVAL('attendance_absent_absent_id_seq', COALESCE((SELECT MAX(absent_id) FROM attendance_absent), 0) + 1);
SELECT SETVAL('attendance_present_present_id_seq', COALESCE((SELECT MAX(present_id) FROM attendance_present), 0) + 1);
SELECT SETVAL('events_event_id_seq', COALESCE((SELECT MAX(event_id) FROM events), 0) + 1);
SELECT SETVAL('event_types_event_type_id_seq', COALESCE((SELECT MAX(event_type_id) FROM event_types), 0) + 1);
SELECT SETVAL('groups_group_id_seq', COALESCE((SELECT MAX(group_id) FROM groups), 0) + 1);

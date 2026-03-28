-- ================================================
-- MIGRATION: Add Record Absents Toggle Feature
-- Date: 2026-02-28
-- RUN THIS IN SUPABASE SQL EDITOR
-- ================================================

-- Update the process_event_attendance function to check for record_absents flag
CREATE OR REPLACE FUNCTION process_event_attendance(p_event_id BIGINT)
RETURNS void AS $$
DECLARE
    v_record_absents BOOLEAN;
BEGIN
    -- Check if this event should record absents from metadata
    -- Default to true for backward compatibility with existing events
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

-- Verify the update was applied (should show function body with v_record_absents)
SELECT prosrc FROM pg_proc WHERE proname = 'process_event_attendance';

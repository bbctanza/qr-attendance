-- ==========================================
-- SELF CHECK-IN SETUP
-- Run this in your Supabase SQL Editor to enable the feature.
-- ==========================================

-- 1. Create a secure function to handle check-ins
-- This bypasses the need for public INSERT permissions on tables
-- and prevents public access to the members list.

CREATE OR REPLACE FUNCTION self_check_in(p_member_id TEXT, p_event_id BIGINT)
RETURNS JSONB AS $$
DECLARE
    v_member_exists BOOLEAN;
    v_member_first_name TEXT;
BEGIN
    -- Check if member exists
    SELECT TRUE, first_name INTO v_member_exists, v_member_first_name
    FROM members 
    WHERE member_id = p_member_id;

    IF v_member_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Member ID not found. Please try again.');
    END IF;

    -- Insert Scan Record directly
    INSERT INTO attendance_scans (scan_id, member_id, event_id, scan_datetime)
    VALUES (
        gen_random_uuid()::text, -- Generate ID if not serial
        p_member_id, 
        p_event_id, 
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Welcome, ' || v_member_first_name || '!',
        'member_name', v_member_first_name
    );

EXCEPTION WHEN unique_violation THEN
    -- Handle duplicate scans if unique constraints exist (though scans usually allow duplicates until processed)
    RETURN jsonb_build_object('success', true, 'message', 'Checked in again!');
WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'System error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Grant access to public (anon) users
GRANT EXECUTE ON FUNCTION self_check_in(TEXT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION self_check_in(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION self_check_in(TEXT, BIGINT) TO service_role;

-- 3. Ensure Events interactions are allowed (Reading Event Info)
-- You might already have policies, but if not:
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active events" 
ON events FOR SELECT 
TO anon 
USING (status IN ('ongoing', 'upcoming', 'completed'));

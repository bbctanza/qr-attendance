CREATE OR REPLACE FUNCTION scan_member_transaction(p_member_id TEXT, p_event_id BIGINT, p_scan_time TIMESTAMP DEFAULT NOW())
RETURNS JSONB AS $$
DECLARE
    v_member RECORD;
    v_group_name TEXT := 'N/A';
    v_existing_scan BOOLEAN;
    v_existing_present BOOLEAN;
BEGIN
    -- 1. Check if member exists and get details
    SELECT first_name, last_name, group_id INTO v_member
    FROM members
    WHERE member_id = p_member_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Member not found');
    END IF;

    -- 2. Check if already checked in to temp scans
    SELECT EXISTS (
        SELECT 1 FROM attendance_scans 
        WHERE member_id = p_member_id AND event_id = p_event_id
    ) INTO v_existing_scan;

    IF v_existing_scan THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Already scanned (pending processing).',
            'member_name', v_member.first_name || ' ' || v_member.last_name,
            'member_id', p_member_id
        );
    END IF;

    -- 3. Check if already checked in permanently (history)
    SELECT EXISTS (
        SELECT 1 FROM attendance_present 
        WHERE member_id = p_member_id AND event_id = p_event_id
    ) INTO v_existing_present;

    IF v_existing_present THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Already marked as present.',
            'member_name', v_member.first_name || ' ' || v_member.last_name,
            'member_id', p_member_id
        );
    END IF;

    -- 4. Get group name if exists
    IF v_member.group_id IS NOT NULL THEN
        SELECT name INTO v_group_name 
        FROM groups 
        WHERE group_id = v_member.group_id;
    END IF;

    -- 5. Insert the scan
    INSERT INTO attendance_scans (scan_id, member_id, event_id, scan_datetime)
    VALUES (gen_random_uuid()::text, p_member_id, p_event_id, p_scan_time);

    -- 6. Return success with data needed for UI
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Scan successful!',
        'member_name', v_member.first_name || ' ' || v_member.last_name,
        'care_group', v_group_name
    );
END;
$$ LANGUAGE plpgsql;

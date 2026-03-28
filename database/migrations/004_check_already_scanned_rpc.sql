CREATE OR REPLACE FUNCTION check_already_scanned(p_member_id TEXT, p_event_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    v_existing_scan BOOLEAN;
    v_existing_present BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM attendance_scans 
        WHERE member_id = p_member_id AND event_id = p_event_id
    ) INTO v_existing_scan;

    IF v_existing_scan THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM attendance_present 
        WHERE member_id = p_member_id AND event_id = p_event_id
    ) INTO v_existing_present;

    RETURN v_existing_present;
END;
$$ LANGUAGE plpgsql;

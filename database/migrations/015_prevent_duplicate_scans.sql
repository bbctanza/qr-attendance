-- Migration 015: Make duplicate check-ins impossible at the database level
--
-- scan_member_transaction's duplicate guard was check-then-insert: it SELECTed whether a scan
-- already existed for this member+event, then, in a separate statement, inserted one. Nothing
-- stopped two calls from both passing that SELECT before either had inserted - a camera and a
-- USB scanner both reading the same code, or simply the same QR presented twice in quick
-- succession while testing, produced two (or more) rows in attendance_scans for one member at
-- one event. There was never a constraint on the table to catch it; the function's own check
-- was the only guard, and check-then-insert can't be made race-proof by itself.

-- ---------------------------------------------------------------------------
-- 1. Clean up any duplicates already sitting in attendance_scans
-- ---------------------------------------------------------------------------
-- ADD CONSTRAINT fails outright if existing data already violates it. Keep the earliest scan
-- per member+event (the one that should have "won"); drop the rest.
WITH ranked AS (
    SELECT scan_id,
           ROW_NUMBER() OVER (
               PARTITION BY member_id, event_id
               ORDER BY scan_datetime ASC, scan_id ASC
           ) AS rn
    FROM attendance_scans
)
DELETE FROM attendance_scans
WHERE scan_id IN (SELECT scan_id FROM ranked WHERE rn > 1);

-- ---------------------------------------------------------------------------
-- 2. The constraint itself
-- ---------------------------------------------------------------------------
ALTER TABLE attendance_scans
    ADD CONSTRAINT attendance_scans_member_event_unique UNIQUE (member_id, event_id);

-- ---------------------------------------------------------------------------
-- 3. scan_member_transaction: insert atomically, let the constraint decide
-- ---------------------------------------------------------------------------
-- The "already scanned (pending processing)" pre-check is gone - it's exactly the
-- check-then-insert gap this migration closes. The INSERT itself, with ON CONFLICT DO NOTHING
-- against the new constraint, is now the single atomic operation that decides whether this
-- scan wins; GET DIAGNOSTICS reads whether it actually inserted a row.
CREATE OR REPLACE FUNCTION scan_member_transaction(p_member_id TEXT, p_event_id BIGINT, p_scan_time TIMESTAMP DEFAULT NOW())
RETURNS JSONB AS $$
DECLARE
    v_member RECORD;
    v_group_name TEXT := 'N/A';
    v_existing_present BOOLEAN;
    v_rows_inserted INTEGER;
BEGIN
    -- 1. Check if member exists and get details
    SELECT first_name, last_name, group_id INTO v_member
    FROM members
    WHERE member_id = p_member_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Member not found');
    END IF;

    -- 2. Check if already checked in permanently (history) - cheap, clear messaging for the
    -- common case; the race this migration actually closes is step 4 below.
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

    -- 3. Get group name if exists
    IF v_member.group_id IS NOT NULL THEN
        SELECT name INTO v_group_name
        FROM groups
        WHERE group_id = v_member.group_id;
    END IF;

    -- 4. Insert the scan atomically - ON CONFLICT against the UNIQUE constraint is what makes
    -- "has this member already scanned into this event" race-proof, not the check above.
    INSERT INTO attendance_scans (scan_id, member_id, event_id, scan_datetime)
    VALUES (gen_random_uuid()::text, p_member_id, p_event_id, p_scan_time)
    ON CONFLICT (member_id, event_id) DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Already scanned (pending processing).',
            'member_name', v_member.first_name || ' ' || v_member.last_name,
            'member_id', p_member_id
        );
    END IF;

    -- 5. Return success with data needed for UI
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Scan successful!',
        'member_name', v_member.first_name || ' ' || v_member.last_name,
        'care_group', v_group_name
    );
END;
$$ LANGUAGE plpgsql;

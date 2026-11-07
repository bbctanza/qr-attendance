-- Migration 009: Make get_attendance_summary authorize once instead of per row
--
-- Migration 008 marked get_user_role() STABLE, which was correct but not sufficient.
-- Measured afterwards, as the authenticated role:
--
--     Function Scan on get_attendance_summary  (actual time=26497..26497 rows=35)
--     Buffers: shared hit=1628188
--     Execution Time: 26500.203 ms
--
-- 1.6 million buffer hits to produce 35 rows, entirely from cache. All-cached but 26 seconds
-- means the time went to CPU, not I/O: a function being called several hundred thousand
-- times.
--
-- WHY STABLE WAS NOT ENOUGH
--
-- The RLS policies on attendance_present and attendance_absent are:
--
--     USING (get_user_role() IN ('developer', 'admin'))
--
-- and get_user_role() is SECURITY DEFINER with `SET search_path = public`. A function with a
-- SET clause can never be inlined by the planner, and every call pays a GUC save/restore.
-- STABLE lets a result be reused within one evaluation, but the policy is still a predicate
-- attached to a scan, so it is evaluated against the rows that scan visits. Counting the
-- attendance history therefore ran that non-inlinable function across every row it touched.
--
-- THE FIX
--
-- Authorize once, explicitly, at the top of the function, and let the counts run without a
-- per-row policy check. This is the same shape as is_admin() in migration 006.
--
-- SECURITY NOTE
--
-- SECURITY DEFINER means RLS on the two history tables is not applied inside this function,
-- so the check here must stand in for it. It does, faithfully: the existing policies grant
-- SELECT on attendance history to every role the app has -
--
--     "Developer/Admin full access to history"  -> developer, admin
--     "Staff and Guest can view history"        -> staff, guest
--
-- so the real rule is "any signed-in user with a profile", which is exactly what is checked
-- below. Anyone without a profile row gets no rows. The function also returns only per-event
-- counts - no member identities - so it cannot leak more than the counts the caller was
-- already entitled to compute.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Indexes, restated defensively in case 007 did not fully apply
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_attendance_present_event_id ON attendance_present (event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_absent_event_id ON attendance_absent (event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_scans_event_id ON attendance_scans (event_id);

-- ---------------------------------------------------------------------------
-- 2. get_attendance_summary(): one authorization check, then plain counts
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 3. Verify
-- ---------------------------------------------------------------------------
-- Expect milliseconds and a few thousand buffers, against 26,500 ms and 1,628,188 before:
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--       json_build_object('sub', (SELECT id::text FROM profiles LIMIT 1),
--                         'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM get_attendance_summary('2026-07-09', '2026-11-06');
--   ROLLBACK;

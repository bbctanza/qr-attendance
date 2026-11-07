-- Migration 013: Aggregate check-in times in the database, not the browser
--
-- WHY
--
-- The analytics rework left one query reading a table directly while everything else on the
-- page went through a SECURITY DEFINER aggregate:
--
--     supabase.from('attendance_present').select('scan_datetime')
--             .gte(...).lte(...).order(...).limit(5000)
--
-- That is the RLS path, and the RLS path on this table is the one measured at 26 seconds and
-- 1.6 million buffer hits in migration 009 - the policies call get_user_role(), which carries
-- a SET clause and so can never be inlined. There is also no index on scan_datetime, so the
-- range filter and the ORDER BY were a sequential scan and a sort on top of that. The page
-- hung on this single call while the rest of it was already fast.
--
-- Shipping 5000 rows to the browser to count them there was the wrong shape anyway.
--
-- WHAT THIS RETURNS
--
-- One row per distinct minute-of-day that had a check-in, already converted into the caller's
-- timezone. At most 1440 rows and in practice a few dozen, which is enough to compute both
-- the hourly histogram and an exact circular mean client-side.
--
-- Timezone conversion belongs here: scan_datetime is a naive TIMESTAMP holding UTC, so
-- `AT TIME ZONE 'UTC' AT TIME ZONE p_timezone` is the only correct way to read a local
-- wall-clock hour off it. An invalid timezone raises rather than silently reporting UTC.
--
-- Same authorization shape as 009 and 012: one check, evaluated once.
--
-- Safe to re-run.

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

-- The join above is on event_id, already indexed by migration 007. This one supports any
-- remaining direct range scans over scan_datetime, which had no index at all.
CREATE INDEX IF NOT EXISTS idx_attendance_present_scan_datetime
    ON attendance_present (scan_datetime DESC);

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--       json_build_object('sub', (SELECT id::text FROM profiles LIMIT 1),
--                         'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM get_check_in_distribution('2026-10-01', '2026-11-30', 'Asia/Manila');
--   ROLLBACK;

-- Diagnostic for the get_attendance_summary statement timeout (SQLSTATE 57014).
-- Read-only. Run the whole file in the Supabase SQL editor and paste all four results.
--
-- The SQL editor normally runs as a superuser, which bypasses RLS entirely - and RLS is
-- exactly what we suspect. Section 4 therefore impersonates the `authenticated` role with
-- real JWT claims so the query runs the way the app runs it, inside a transaction that is
-- rolled back.

-- ---------------------------------------------------------------------------
-- 1. Did migration 008 actually apply?
--    provolatile: 'v' = VOLATILE (the bug), 's' = STABLE (fixed), 'i' = IMMUTABLE
--    get_user_role MUST be 's'. If it is 'v', migration 008 has not been applied.
-- ---------------------------------------------------------------------------
SELECT
    p.proname AS function_name,
    p.provolatile AS volatility,
    CASE p.provolatile
        WHEN 'v' THEN 'VOLATILE - re-runs per row in every RLS policy'
        WHEN 's' THEN 'STABLE - evaluated once per query'
        WHEN 'i' THEN 'IMMUTABLE'
    END AS meaning
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_role', 'is_admin', 'get_attendance_summary')
ORDER BY p.proname;

-- ---------------------------------------------------------------------------
-- 2. How much data is actually being scanned?
-- ---------------------------------------------------------------------------
SELECT
    c.relname AS table_name,
    to_char(c.reltuples::BIGINT, 'FM999,999,999') AS estimated_rows,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('attendance_present', 'attendance_absent', 'attendance_scans',
                    'members', 'events')
ORDER BY c.reltuples DESC;

-- ---------------------------------------------------------------------------
-- 3. Did migration 007's indexes get created?
--    Expect idx_attendance_present_event_id, idx_attendance_absent_event_id,
--    idx_attendance_scans_event_id, idx_attendance_scans_event_time.
-- ---------------------------------------------------------------------------
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('attendance_present', 'attendance_absent', 'attendance_scans')
ORDER BY tablename, indexname;

-- ---------------------------------------------------------------------------
-- 4. Run the query the way the app runs it, as `authenticated`, and time it.
--    Rolled back; changes nothing.
-- ---------------------------------------------------------------------------
BEGIN;

-- Claims must be set while still privileged enough to read profiles.
SELECT set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (SELECT id::text FROM profiles WHERE email = 'karleriel.atabay@cvsu.edu.ph'),
        'role', 'authenticated'
    )::text,
    true
);

SET LOCAL ROLE authenticated;

-- Generous ceiling so this reports a real duration instead of being cancelled like the app.
SET LOCAL statement_timeout = '120s';

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM get_attendance_summary('2026-07-09', '2026-11-06');

ROLLBACK;

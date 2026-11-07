-- Migration 012: Per-group attendance aggregate for the analytics page
--
-- WHY
--
-- /analytics built its group chart with two queries per group - one counting attendance,
-- one counting members - and then threw the member count away, plotting each group's share
-- of total attendance instead. The number people actually want is each group's own
-- participation rate, which needs both counts side by side.
--
-- There is no per-group aggregate anywhere in the schema; the only precedent is the N+1 loop
-- in groups/+page.svelte, which is the thing to avoid rather than copy.
--
-- SHAPE
--
-- Deliberately modelled on get_attendance_summary() as it stands after migration 009:
-- SECURITY DEFINER with a single authorization check evaluated once in a CTE. That is what
-- took the attendance summary from 26 seconds and 1.6 million buffer hits down to
-- milliseconds - letting the RLS policies re-evaluate get_user_role() per scanned row is
-- what caused the timeout, and this function reads the same tables.
--
-- SECURITY NOTE
--
-- Same reasoning as 009: RLS is not applied inside the function, so the check below stands in
-- for it, and it reproduces the existing policies faithfully - attendance history and members
-- are readable by developer, admin, staff and guest alike, i.e. any signed-in user with a
-- profile. The function returns only per-group counts, never member identities.
--
-- Internal columns are named gid/cnt rather than group_id/member_count on purpose: the
-- RETURNS TABLE output names are in scope inside the body, and an unqualified reference to
-- one of them would be ambiguous.
--
-- Safe to re-run.

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

-- Supports the member join in present_per_group.
CREATE INDEX IF NOT EXISTS idx_members_group_id ON members (group_id);

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--       json_build_object('sub', (SELECT id::text FROM profiles LIMIT 1),
--                         'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM get_group_attendance_summary('2026-10-01', '2026-11-30');
--   ROLLBACK;
--
-- Expect milliseconds and a few thousand buffers. If it runs long, the cause will be the
-- same one as migration 009 - an authorization check being evaluated per row.

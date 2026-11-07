-- Migration 008: Fix "canceling statement due to statement timeout" on get_attendance_summary
--
-- Two compounding causes. The first is the important one and is not specific to attendance.
--
-- 1. get_user_role() WAS VOLATILE
--
--    It was declared without a volatility marker, and the default is VOLATILE. Every RLS
--    policy on events, members, attendance_present and attendance_absent calls it:
--
--        USING (get_user_role() IN ('developer', 'admin'))
--
--    Postgres may not cache a VOLATILE function, so it re-executed
--    `SELECT role FROM profiles WHERE id = auth.uid()` once PER ROW SCANNED - on every
--    query, on every one of those tables, for every signed-in user. Aggregating the whole
--    attendance history meant tens of thousands of executions and blew the statement
--    timeout. The function only reads, so STABLE is both correct and what lets the planner
--    evaluate it once per query.
--
--    This affects far more than the attendance pages: every authenticated read of any
--    RLS-protected table was paying this. is_admin() in migration 006 was already STABLE;
--    this brings get_user_role() in line.
--
--    Nothing about who can see what changes - only how many times the check runs.
--
-- 2. get_attendance_summary() aggregated both history tables in full
--
--    It built GROUP BY totals over all of attendance_present and attendance_absent and then
--    joined that to the month's events, so asking for one month still scanned every
--    attendance row ever recorded. Replaced with per-event correlated counts, which can use
--    the idx_attendance_*_event_id indexes added in migration 007.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. get_user_role(): STABLE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 2. get_attendance_summary(): count per event, not per table
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
SECURITY INVOKER
SET search_path = public
AS $$
    WITH scoped AS (
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
        WHERE e.status = 'completed'
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
        -- Correlated so each count is an index lookup on this one event, rather than a full
        -- aggregate of the table that is then discarded for every event outside the range.
        (SELECT COUNT(*) FROM attendance_present ap WHERE ap.event_id = s.event_id)::INTEGER,
        (SELECT COUNT(*) FROM attendance_absent aa WHERE aa.event_id = s.event_id)::INTEGER
    FROM scoped s
    ORDER BY s.event_date DESC, s.end_datetime DESC;
$$;

REVOKE ALL ON FUNCTION get_attendance_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_attendance_summary(DATE, DATE) TO authenticated;

-- Migration 007: Attendance live updates and summary aggregation
--
-- Supports the attendance rework. Three independent additions, all re-runnable.
--
-- 1. REALTIME ON attendance_scans
--
--    /attendance has always shown a pulsing dot and the words "Live Updates", but the page
--    fetched once on mount and never again: during a service the checked-in count was frozen
--    at whatever it was when the page loaded. Only user_sessions was ever published, so the
--    client had nothing to subscribe to.
--
-- 2. INDEXES ON event_id
--
--    attendance_present and attendance_absent carry one index each, from
--    UNIQUE (member_id, event_id). member_id leads it, so the event_id-only lookups that
--    every attendance query performs cannot use it and fall back to a sequential scan.
--
-- 3. get_attendance_summary()
--
--    There was no attendance aggregate anywhere in the schema, so both pages counted in
--    client loops - the history page fetched every completed event ever and then issued two
--    roster queries per event, discarding nearly all of it to show one month. This returns
--    one row per event for a date range, letting that become a single call.

-- ---------------------------------------------------------------------------
-- 1. Realtime
-- ---------------------------------------------------------------------------

-- REPLICA IDENTITY FULL so DELETE payloads carry event_id, which is what the client filters
-- on. Without it a delete arrives with only the primary key and the subscriber cannot tell
-- whether the row belonged to the event it is watching.
ALTER TABLE attendance_scans REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_scans;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'attendance_scans is already in the supabase_realtime publication';
    WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication not found; enable Realtime for attendance_scans in the dashboard';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_attendance_present_event_id ON attendance_present (event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_absent_event_id ON attendance_absent (event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_scans_event_id ON attendance_scans (event_id);

-- Recent-scan lists read newest-first within one event.
CREATE INDEX IF NOT EXISTS idx_attendance_scans_event_time
    ON attendance_scans (event_id, scan_datetime DESC);

-- ---------------------------------------------------------------------------
-- 3. get_attendance_summary()
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER (the default, stated here because it is load-bearing): the counts must be
-- taken under the caller's own RLS on the attendance tables, not escalated.
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
    SELECT
        e.event_id,
        e.event_name,
        e.event_date,
        e.start_datetime,
        e.end_datetime,
        -- Same expression as process_event_attendance(), so the page's idea of whether an
        -- event tracks absences cannot drift from the processor that wrote the rows.
        COALESCE((e.metadata->>'record_absents')::BOOLEAN, true) AS records_absents,
        COALESCE(p.cnt, 0)::INTEGER AS present_count,
        COALESCE(a.cnt, 0)::INTEGER AS absent_count
    FROM events e
    -- Aggregate before joining: joining both child tables first would multiply present rows
    -- by absent rows and inflate every count.
    LEFT JOIN (
        SELECT ap.event_id, COUNT(*) AS cnt
        FROM attendance_present ap
        GROUP BY ap.event_id
    ) p ON p.event_id = e.event_id
    LEFT JOIN (
        SELECT aa.event_id, COUNT(*) AS cnt
        FROM attendance_absent aa
        GROUP BY aa.event_id
    ) a ON a.event_id = e.event_id
    WHERE e.status = 'completed'
      AND e.event_date >= p_from
      AND e.event_date <= p_to
    ORDER BY e.event_date DESC, e.end_datetime DESC;
$$;

REVOKE ALL ON FUNCTION get_attendance_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_attendance_summary(DATE, DATE) TO authenticated;

-- Migration 010: Prevent overlapping events
--
-- WHAT WAS WRONG
--
-- check_simultaneous_events() only ran its checks when the incoming event was NON-recurring:
--
--     IF NEW.is_recurring = FALSE THEN  ...raise on overlap...
--     ELSE                              ...DELETE overlapping non-recurring events...
--
-- Two consequences, both observed in live data:
--
--   1. Recurring vs recurring was never checked. Anything flagged is_recurring skipped every
--      check, which is how event 165 ("Choir practice", 01:08-09:00, event_type_id NULL but
--      is_recurring true) came to straddle both event 164 (23:30-03:00) and event 163
--      (03:00-08:00) on the same morning.
--
--   2. The ELSE branch silently DELETED overlapping non-recurring events. Not an error, not
--      an audit entry - a staff member's one-off event simply disappeared. A guard rail must
--      never destroy the thing it is guarding.
--
-- WHAT REPLACES IT
--
-- One symmetric rule at each layer:
--
--   events       - no two active events (upcoming/ongoing) may overlap in time, whatever
--                  their origin. Nothing is ever deleted; the write is refused instead.
--   event_types  - no two active recurring templates may overlap on the weekly clock, so
--                  the collision is caught when the schedule is defined rather than every
--                  time it generates.
--
-- Completed events are left alone, so history stays editable and the pre-existing overlaps
-- are grandfathered. Run database/find_event_overlaps.sql to list those.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. events: no two active events may overlap
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trigger_check_simultaneous_events ON events;
DROP FUNCTION IF EXISTS check_simultaneous_events();

CREATE OR REPLACE FUNCTION check_event_overlap()
RETURNS TRIGGER AS $$
DECLARE
    conflict RECORD;
BEGIN
    -- A sanity guard worth having on its own: a zero or negative duration would make every
    -- overlap test below vacuously false.
    IF NEW.end_datetime <= NEW.start_datetime THEN
        RAISE EXCEPTION 'Event must end after it starts (got % to %)',
            NEW.start_datetime, NEW.end_datetime
            USING ERRCODE = '22007',
                  HINT = 'Check the start and end times.';
    END IF;

    -- Only active events compete for the scanner's attention. Completed events are history
    -- and must stay editable even where they already overlap.
    IF NEW.status NOT IN ('upcoming', 'ongoing') THEN
        RETURN NEW;
    END IF;

    SELECT e.event_id, e.event_name, e.start_datetime, e.end_datetime
      INTO conflict
    FROM events e
    WHERE e.event_id IS DISTINCT FROM NEW.event_id
      AND e.status IN ('upcoming', 'ongoing')
      -- Half-open comparison: one event ending exactly as another begins is not an overlap.
      AND NEW.start_datetime < e.end_datetime
      AND NEW.end_datetime > e.start_datetime
    ORDER BY e.start_datetime
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'This event overlaps "%" (% to %)',
            conflict.event_name,
            to_char(conflict.start_datetime, 'Mon DD HH24:MI'),
            to_char(conflict.end_datetime, 'Mon DD HH24:MI')
            USING ERRCODE = '23P01',
                  HINT = 'Two events cannot run at the same time. Move one of them first.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_event_overlap
    BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION check_event_overlap();

-- ---------------------------------------------------------------------------
-- 2. event_types: no two active templates may overlap on the weekly clock
-- ---------------------------------------------------------------------------

-- A template occupies a span on a 7-day, 10080-minute clock. Expressing it as ranges is
-- what makes an overnight schedule comparable to a daytime one: a Sunday 23:30-03:00 slot
-- genuinely occupies late Sunday AND early Monday, and must collide with a Monday 02:00
-- template. Returns two ranges when the span wraps past the end of the week.
CREATE OR REPLACE FUNCTION event_type_week_ranges(p_dow INTEGER, p_start TIME, p_end TIME)
RETURNS SETOF int4range
LANGUAGE sql
IMMUTABLE
AS $$
    WITH bounds AS (
        SELECT
            p_dow * 1440 + (EXTRACT(EPOCH FROM p_start) / 60)::INT AS s,
            p_dow * 1440 + (EXTRACT(EPOCH FROM p_end) / 60)::INT
                -- end <= start means the schedule runs past midnight into the next day.
                + CASE WHEN p_end <= p_start THEN 1440 ELSE 0 END AS e
    )
    SELECT int4range(s, LEAST(e, 10080)) FROM bounds
    UNION ALL
    SELECT int4range(0, e - 10080) FROM bounds WHERE e > 10080;
$$;

CREATE OR REPLACE FUNCTION check_event_type_overlap()
RETURNS TRIGGER AS $$
DECLARE
    conflict RECORD;
BEGIN
    -- Deactivated templates generate nothing, so they cannot collide with anything.
    IF NEW.is_active IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    SELECT et.event_type_id, et.name, et.day_of_week, et.start_time, et.end_time
      INTO conflict
    FROM event_types et
    WHERE et.event_type_id IS DISTINCT FROM NEW.event_type_id
      AND et.is_active IS TRUE
      AND EXISTS (
          SELECT 1
          FROM event_type_week_ranges(NEW.day_of_week, NEW.start_time, NEW.end_time) AS nr,
               event_type_week_ranges(et.day_of_week, et.start_time, et.end_time) AS er
          WHERE nr && er
      )
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'This schedule overlaps "%" (% %-%)',
            conflict.name,
            to_char(DATE '2024-01-07' + conflict.day_of_week, 'Dy'),
            to_char(conflict.start_time, 'HH24:MI'),
            to_char(conflict.end_time, 'HH24:MI')
            USING ERRCODE = '23P01',
                  HINT = 'Two recurring schedules cannot run at the same time. Change the time, the day, or deactivate the other schedule.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_event_type_overlap ON event_types;
CREATE TRIGGER trigger_check_event_type_overlap
    BEFORE INSERT OR UPDATE ON event_types
    FOR EACH ROW EXECUTE FUNCTION check_event_type_overlap();

-- ---------------------------------------------------------------------------
-- 3. generate_recurring_events(): skip collisions instead of failing the run
-- ---------------------------------------------------------------------------

-- The trigger above would otherwise abort the whole generation run on the first collision,
-- which would stop the nightly job producing any events at all. Skipping the colliding
-- instance and carrying on keeps one bad schedule from taking down the calendar.
CREATE OR REPLACE FUNCTION generate_recurring_events(start_date DATE, end_date DATE)
RETURNS INTEGER AS $$
DECLARE
    current_d       DATE;
    dow             INTEGER;
    et              RECORD;
    events_created  INTEGER := 0;
    events_skipped  INTEGER := 0;
    event_start     TIMESTAMP;
    event_end       TIMESTAMP;
BEGIN
    current_d := start_date;

    WHILE current_d <= end_date LOOP
        dow := EXTRACT(DOW FROM current_d);

        FOR et IN SELECT * FROM event_types WHERE is_active = TRUE AND day_of_week = dow LOOP
            event_start := current_d + et.start_time;
            event_end := current_d + et.end_time;

            IF et.end_time <= et.start_time THEN
                event_end := event_end + INTERVAL '1 day';
            END IF;

            -- Already generated for this template and date.
            IF EXISTS (
                SELECT 1 FROM events
                WHERE event_type_id = et.event_type_id AND event_date = current_d
            ) THEN
                CONTINUE;
            END IF;

            -- Would collide with something already on the calendar.
            IF EXISTS (
                SELECT 1 FROM events x
                WHERE x.status IN ('upcoming', 'ongoing')
                  AND event_start < x.end_datetime
                  AND event_end > x.start_datetime
            ) THEN
                events_skipped := events_skipped + 1;
                CONTINUE;
            END IF;

            INSERT INTO events (
                event_type_id, event_name, event_date,
                start_datetime, end_datetime,
                status, is_custom, is_recurring, description, metadata
            ) VALUES (
                et.event_type_id, et.name, current_d,
                event_start, event_end,
                'upcoming', FALSE, TRUE,
                'Automatically generated from recurring schedule', et.metadata
            );
            events_created := events_created + 1;
        END LOOP;

        current_d := current_d + 1;
    END LOOP;

    IF events_skipped > 0 THEN
        RAISE NOTICE '% recurring event(s) skipped because they would overlap an existing event', events_skipped;
    END IF;

    RETURN events_created;
END;
$$ LANGUAGE plpgsql;

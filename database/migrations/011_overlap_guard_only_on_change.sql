-- Migration 011: Only enforce the overlap rule when the overlap actually changes
--
-- WHAT BROKE
--
-- Deleting a recurring template failed with:
--
--     Failed to delete template: This event overlaps "Sunday Morning Worship Service"
--     (Nov 07 23:30 to Nov 08 03:00)
--
-- events.event_type_id is declared REFERENCES event_types(event_type_id) ON DELETE SET NULL,
-- so removing a template issues an UPDATE against every event it ever generated. The
-- BEFORE UPDATE trigger from migration 010 fired on each of those rows, found they still
-- overlapped something, and aborted the delete - even though the update changed nothing about
-- when the event runs.
--
-- The same trap caught any write touching a grandfathered row: renaming it, editing its
-- location, or changing record_absents would all be refused because of a conflict the edit
-- was not introducing and often was trying to clear up.
--
-- THE FIX
--
-- Enforce on INSERT always, and on UPDATE only when a column the rule depends on actually
-- changes. Moving an event into a conflict is still refused; everything else is let through.
-- This is what makes the rule safe to retrofit onto data that predates it - which is exactly
-- the situation it was introduced into.
--
-- The same guard is applied to the event_types trigger for the same reason.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. events
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_event_overlap()
RETURNS TRIGGER AS $$
DECLARE
    conflict RECORD;
BEGIN
    -- IS NOT DISTINCT FROM rather than =, so a NULL on either side compares as equal
    -- instead of yielding NULL and falling through to the check.
    IF TG_OP = 'UPDATE'
       AND NEW.start_datetime IS NOT DISTINCT FROM OLD.start_datetime
       AND NEW.end_datetime   IS NOT DISTINCT FROM OLD.end_datetime
       AND NEW.status         IS NOT DISTINCT FROM OLD.status
    THEN
        -- Nothing that bears on overlap changed. Let cascades, renames and metadata edits
        -- through untouched.
        RETURN NEW;
    END IF;

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

-- ---------------------------------------------------------------------------
-- 2. event_types
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_event_type_overlap()
RETURNS TRIGGER AS $$
DECLARE
    conflict RECORD;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.day_of_week IS NOT DISTINCT FROM OLD.day_of_week
       AND NEW.start_time  IS NOT DISTINCT FROM OLD.start_time
       AND NEW.end_time    IS NOT DISTINCT FROM OLD.end_time
       AND NEW.is_active   IS NOT DISTINCT FROM OLD.is_active
    THEN
        RETURN NEW;
    END IF;

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

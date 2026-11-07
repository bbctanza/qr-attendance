-- List every pair of overlapping events, including completed ones.
--
-- Migration 010 blocks new overlaps but deliberately leaves existing rows alone, so history
-- stays editable and nothing is rewritten under you. This is how you find what predates the
-- rule and decide case by case.
--
-- Read-only. Each pair is listed once (a.event_id < b.event_id).

SELECT
    a.event_id                                  AS event_a,
    a.event_name                                AS name_a,
    to_char(a.start_datetime, 'YYYY-MM-DD HH24:MI') AS a_start,
    to_char(a.end_datetime,   'YYYY-MM-DD HH24:MI') AS a_end,
    a.status                                    AS a_status,
    b.event_id                                  AS event_b,
    b.event_name                                AS name_b,
    to_char(b.start_datetime, 'YYYY-MM-DD HH24:MI') AS b_start,
    to_char(b.end_datetime,   'YYYY-MM-DD HH24:MI') AS b_end,
    b.status                                    AS b_status,
    -- How much they actually collide by, which is usually what decides whether it was a
    -- genuine double-booking or a boundary that was typed a few minutes wrong.
    to_char(
        LEAST(a.end_datetime, b.end_datetime) - GREATEST(a.start_datetime, b.start_datetime),
        'HH24:MI'
    )                                           AS overlap_duration
FROM events a
JOIN events b
  ON b.event_id > a.event_id
 AND a.start_datetime < b.end_datetime
 AND a.end_datetime > b.start_datetime
ORDER BY a.start_datetime DESC;

-- Active overlaps only - these are the ones that would block an edit under the new rule.
SELECT
    a.event_id AS event_a, a.event_name AS name_a,
    b.event_id AS event_b, b.event_name AS name_b,
    to_char(a.start_datetime, 'YYYY-MM-DD HH24:MI') AS a_start,
    to_char(b.start_datetime, 'YYYY-MM-DD HH24:MI') AS b_start
FROM events a
JOIN events b
  ON b.event_id > a.event_id
 AND a.start_datetime < b.end_datetime
 AND a.end_datetime > b.start_datetime
WHERE a.status IN ('upcoming', 'ongoing')
  AND b.status IN ('upcoming', 'ongoing')
ORDER BY a.start_datetime;

-- Recurring templates that collide on the weekly clock. Requires migration 010
-- (event_type_week_ranges). These will be refused on the next edit.
SELECT
    a.event_type_id AS type_a, a.name AS name_a,
    to_char(DATE '2024-01-07' + a.day_of_week, 'Dy') AS day_a,
    to_char(a.start_time, 'HH24:MI') || '-' || to_char(a.end_time, 'HH24:MI') AS time_a,
    b.event_type_id AS type_b, b.name AS name_b,
    to_char(DATE '2024-01-07' + b.day_of_week, 'Dy') AS day_b,
    to_char(b.start_time, 'HH24:MI') || '-' || to_char(b.end_time, 'HH24:MI') AS time_b
FROM event_types a
JOIN event_types b ON b.event_type_id > a.event_type_id
WHERE a.is_active AND b.is_active
  AND EXISTS (
      SELECT 1
      FROM event_type_week_ranges(a.day_of_week, a.start_time, a.end_time) ar,
           event_type_week_ranges(b.day_of_week, b.start_time, b.end_time) br
      WHERE ar && br
  )
ORDER BY a.day_of_week, a.start_time;

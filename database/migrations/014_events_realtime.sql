-- Migration 014: Realtime on events
--
-- The scan page (and kiosk standby on it) only ever learned about a new, started, or ended
-- event from its own 30s poll. Fine for most cases, but a kiosk sitting unattended between
-- events is exactly the case where a 30s-late reaction is most visible: someone creates or
-- starts an event and the device sits in standby for up to half a minute before noticing.
--
-- REPLICA IDENTITY FULL, matching attendance_scans in migration 007, so a status change or
-- deletion carries the full row rather than just the primary key - the client's subscriber
-- doesn't filter by event_id (any change is worth a refetch), but FULL keeps this consistent
-- with the one other realtime table and cheap to extend later if that changes.
ALTER TABLE events REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'events is already in the supabase_realtime publication';
    WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication not found; enable Realtime for events in the dashboard';
END $$;

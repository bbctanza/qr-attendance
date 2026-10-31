-- Migration 005: Bind user_sessions rows to the real GoTrue auth session
--
-- Previously each row carried a random UUID that was stashed in localStorage and had no
-- relationship to the user's actual Supabase auth session. That made it impossible to tell
-- which row belonged to the current device, so the "Current" badge, per-device revocation
-- and "log out all other devices" were all unreliable.
--
-- auth_session_id holds the `session_id` claim from the access-token JWT, which gives every
-- device a stable, exact identity and lets registration be an idempotent upsert.

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS auth_session_id UUID;

-- One row per auth session. Not partial: Postgres already allows many NULLs in a unique
-- index (legacy rows), and a partial index could not be used for ON CONFLICT inference,
-- which registerSession() relies on to upsert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_auth_session_id
    ON user_sessions(auth_session_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
    ON user_sessions(user_id, is_active);

-- Legacy rows can never be matched back to a device, so they can never be revoked or
-- badged correctly. Retire them rather than leaving them permanently "active".
UPDATE user_sessions SET is_active = FALSE WHERE auth_session_id IS NULL;

-- Realtime is what delivers the revocation kick to the target device.
-- REPLICA IDENTITY FULL so change payloads carry user_id for RLS filtering on every event type.
ALTER TABLE user_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_sessions;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'user_sessions is already in the supabase_realtime publication';
    WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication not found; enable Realtime for user_sessions in the dashboard';
END $$;

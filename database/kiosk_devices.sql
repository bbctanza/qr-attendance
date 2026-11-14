-- =============================================================================
-- Kiosk device pairing  —  kiosk-rs/PLAN.md section 8
-- =============================================================================
--
-- Replaces "sign the kiosk in with an invited staff account". That arrangement had a machine
-- using a human's credentials: an invitation consumed, an account password typed at a door in
-- front of a queue, credentials that unlock the whole web app sitting on a device in a public
-- room, and no way to revoke one kiosk without disturbing anything else.
--
-- A kiosk becomes a *device the organisation owns*. Pairing is a one-use code, and each device
-- gets its own hidden auth user so RLS, the scan RPC and the audit trail keep working exactly
-- as they do today — scan_member_transaction only requires any resolved role.
--
-- SAFE TO RE-RUN: every statement is guarded.
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE kiosk_device_status AS ENUM ('active', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Devices
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kiosk_devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    -- The hidden per-device auth user. ON DELETE CASCADE: removing the user removes the
    -- device row with it, so a device can never outlive the identity it scans as.
    auth_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status          kiosk_device_status NOT NULL DEFAULT 'active',

    -- PBKDF2-SHA256 of the settings PIN, with its salt. The device verifies against its own
    -- copy so Settings opens offline; this copy is what lets an admin reset it remotely.
    pin_hash        TEXT NOT NULL,
    pin_salt        TEXT NOT NULL,

    paired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paired_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Denormalised for the same reason invitations.invited_by_email is: deleting the admin
    -- must not erase who paired the device.
    paired_by_email TEXT,

    last_seen_at    TIMESTAMPTZ,
    app_version     TEXT,

    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kiosk_devices_auth_user
    ON kiosk_devices (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_devices_status
    ON kiosk_devices (status, last_seen_at DESC NULLS LAST);

-- -----------------------------------------------------------------------------
-- Pairing codes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kiosk_pairing_codes (
    -- 8 chars of Crockford base32 (no O/0, no I/1/L): this gets read aloud across a room.
    code             TEXT PRIMARY KEY,
    pin_hash         TEXT NOT NULL,
    pin_salt         TEXT NOT NULL,
    device_name      TEXT,
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_email TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
    -- Counted so a code cannot be brute-forced in the ten minutes it is alive.
    attempts         INTEGER NOT NULL DEFAULT 0,
    consumed_at      TIMESTAMPTZ,
    consumed_by      UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kiosk_pairing_codes_live
    ON kiosk_pairing_codes (expires_at) WHERE consumed_at IS NULL;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Neither table is reachable from a browser or a kiosk. Every operation goes through the
-- invitation-service edge function, which holds the service-role key and does its own
-- admin checks. Enabling RLS with read-only policies means a leaked anon key gets nothing,
-- and a leaked *device* session cannot enumerate other devices or read any PIN hash.
ALTER TABLE kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_pairing_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kiosk_devices_read_admin ON kiosk_devices;
CREATE POLICY kiosk_devices_read_admin ON kiosk_devices
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'developer')
        )
    );

-- Deliberately NO policy on kiosk_pairing_codes: with RLS on and no policy, every client is
-- denied. A pairing code plus its PIN hash is enough to stand up a device, so nothing but the
-- service role should ever see this table.

-- -----------------------------------------------------------------------------
-- Housekeeping
-- -----------------------------------------------------------------------------
-- Expired codes are useless and carry a PIN hash, so they should not linger.
CREATE OR REPLACE FUNCTION purge_expired_pairing_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM kiosk_pairing_codes
    WHERE consumed_at IS NULL AND expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE kiosk_devices IS
    'Paired attendance kiosks. One hidden auth user each; see kiosk-rs/PLAN.md section 8.';
COMMENT ON TABLE kiosk_pairing_codes IS
    'One-use, short-lived codes for binding a kiosk. Service-role access only.';

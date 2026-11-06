-- Migration 006: Access Directory
--
-- Reworks staff access control into a tracked invitation lifecycle and closes three
-- privilege-escalation paths that existed in the previous design.
--
-- WHAT WAS BROKEN
--
-- 1. handle_new_user() read the new account's role straight out of
--    raw_user_meta_data->>'role'. User metadata is writable by the user it belongs to, so
--    any path that reaches auth.users with attacker-chosen metadata (an open signup, a
--    third-party provider, a leaked anon-key signUp call) could mint an admin. The role a
--    new account receives must come from something only the server can write.
--
-- 2. The "Users can update their own profile" RLS policy allowed UPDATE on every column
--    of one's own row, role included. A guest could promote themselves with a single
--    client-side PostgREST call - no edge function needed.
--
-- 3. "Everyone can view profiles" granted SELECT to `anon`, publishing every staff email
--    address to unauthenticated callers. No public route reads profiles, so this was pure
--    exposure.
--
-- WHAT REPLACES IT
--
-- An `invitations` table that is the single server-owned record of who was invited, as
-- what, by whom, and whether that invitation is still live. handle_new_user() resolves the
-- role by looking the new email up there; anything not matching a live invitation lands as
-- `guest`, the least-privileged role, rather than `staff`.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN RAISE NOTICE 'type invitation_status already exists';
END $$;

DO $$
BEGIN
    CREATE TYPE account_status AS ENUM ('active', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN RAISE NOTICE 'type account_status already exists';
END $$;

-- ---------------------------------------------------------------------------
-- 2. invitations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'staff',
    status invitation_status NOT NULL DEFAULT 'pending',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Denormalised so a revoked inviter's account can be deleted without the audit trail
    -- losing who sent the invitation.
    invited_by_email TEXT,
    -- Mirrors Supabase's own invite-link lifetime. Rows past this are treated as expired
    -- by every read path, whether or not the sweep below has run.
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Bumped by resend so the directory can show "sent 3 times, last 2h ago".
    resend_count INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one live invitation per address. Partial, so the history of accepted and revoked
-- invitations to the same address is kept rather than overwritten.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_pending_per_email
    ON invitations (lower(email))
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitations_email_lower ON invitations (lower(email));
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. profiles: account status and activity
-- ---------------------------------------------------------------------------

-- Suspension is the reversible counterpart to deletion. Removing a staff member used to
-- mean auth.admin.deleteUser(), which cascades their entire history away; most of the time
-- what an admin actually wants is to stop someone signing in.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status account_status NOT NULL DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON profiles (role, status);

-- ---------------------------------------------------------------------------
-- 4. is_admin(): the authorization predicate, in one place
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so policies on profiles can call it without recursing through
-- profiles' own RLS. STABLE so the planner may call it once per statement.
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = uid
          AND role IN ('admin', 'developer')
          AND status = 'active'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. handle_new_user(): role comes from the invitation, never from user metadata
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    invitation   public.invitations%ROWTYPE;
    granted_role user_role;
BEGIN
    SELECT * INTO invitation
    FROM public.invitations
    WHERE lower(email) = lower(new.email)
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    -- No live invitation means this account arrived by some route we did not initiate.
    -- It still gets a profile (the app assumes one exists for every auth user), but at the
    -- lowest privilege level, where it is visible in the directory and can be promoted
    -- deliberately. Previously this defaulted to 'staff' via attacker-supplied metadata.
    granted_role := COALESCE(invitation.role, 'guest'::user_role);

    INSERT INTO public.profiles (id, email, full_name, role, invited_by)
    VALUES (
        new.id,
        new.email,
        new.raw_user_meta_data->>'full_name',
        granted_role,
        invitation.invited_by
    );

    -- The invitation is deliberately NOT marked accepted here.
    --
    -- inviteUserByEmail() creates the auth row the instant the email is *sent*, so this
    -- trigger fires long before anyone clicks the link. Closing the invitation here would
    -- mean no invitation is ever observably pending: the directory could not show who
    -- still owes a response, and Resend and Revoke would have nothing to act on.
    -- Acceptance is recorded when setup actually completes - see
    -- mark_invitation_accepted() below.

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- An invitation is accepted at the moment its recipient finishes account setup, which is
-- the moment onboarding_completed flips true. Doing it with a trigger rather than from the
-- setup page keeps it true however the flag gets set, and means the invitations table needs
-- no write policy for ordinary users.
CREATE OR REPLACE FUNCTION mark_invitation_accepted()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.onboarding_completed IS TRUE AND OLD.onboarding_completed IS DISTINCT FROM TRUE THEN
        UPDATE public.invitations
        SET status = 'accepted',
            accepted_at = NOW(),
            accepted_user_id = NEW.id
        WHERE lower(email) = lower(NEW.email)
          AND status = 'pending';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_onboarding_completed ON profiles;
CREATE TRIGGER on_profile_onboarding_completed
    AFTER UPDATE OF onboarding_completed ON profiles
    FOR EACH ROW EXECUTE FUNCTION mark_invitation_accepted();

-- ---------------------------------------------------------------------------
-- 6. Stop clients writing their own role or status
-- ---------------------------------------------------------------------------

-- RLS WITH CHECK cannot compare against OLD, so column-level immutability needs a trigger.
-- The edge function reaches Postgres as service_role and is exempt; everything arriving
-- over PostgREST as `authenticated` is not, which is what closes the one-call self-promotion.
CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER AS $$
DECLARE
    jwt_role TEXT;
BEGIN
    jwt_role := COALESCE(
        current_setting('request.jwt.claims', true)::json->>'role',
        current_user
    );

    IF jwt_role IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'profiles.role cannot be changed directly. Use the access service.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'profiles.status cannot be changed directly. Use the access service.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_privileged_update ON profiles;
CREATE TRIGGER on_profile_privileged_update
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view invitations" ON invitations;
CREATE POLICY "Admins can view invitations" ON invitations
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policy by design: every write goes through the edge function on
-- the service role, which is where the authorization and elevation checks live. An admin
-- reading the table directly is useful; an admin writing it directly would bypass them.

-- Emails of every staff member were readable by `anon`. Nothing public needs them.
DROP POLICY IF EXISTS "Everyone can view profiles" ON profiles;
CREATE POLICY "Authenticated users can view profiles" ON profiles
    FOR SELECT TO authenticated
    USING (true);

-- ---------------------------------------------------------------------------
-- 8. Housekeeping
-- ---------------------------------------------------------------------------

-- Lapsed invitations are already treated as expired on read; this keeps the stored status
-- honest so the directory's counts match. Call it from a cron job if you have one.
CREATE OR REPLACE FUNCTION expire_stale_invitations()
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE public.invitations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at <= NOW();
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Existing accounts predate the invitations table. ADD COLUMN ... NOT NULL DEFAULT
-- 'active' above already backfills them, so there is nothing further to migrate: they
-- simply have no invitation row, which reads as "joined before invitations were tracked".

SELECT expire_stale_invitations();

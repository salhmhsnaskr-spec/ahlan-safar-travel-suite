-- INDEPENDENT LOCAL INSTANCE ONLY. Never apply to hosted production.
-- Apply AFTER the immutable six-file reference baseline, before serving the API.
BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated, sandbox_exec;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM PUBLIC, anon, authenticated, sandbox_exec;
-- Table-level REVOKE does not remove independently granted column privileges.
DO $$
DECLARE col record;
BEGIN
  FOR col IN
    SELECT c.relname, a.attname FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p','f')
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON public.%I FROM PUBLIC, anon, authenticated, sandbox_exec', col.attname, col.relname);
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Match existing application operations; RLS continues to decide whose rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.bookings, public.customers, public.partner_offices, public.requests,
  public.services, public.tasks, public.umrah_participants, public.umrah_trips
TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.documents TO authenticated;
GRANT SELECT, UPDATE ON public.offices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.activity_log, public.platform_owners, public.office_members
TO authenticated;
-- Existing role selector remains functional. Lifecycle changes use the RPC.
GRANT UPDATE (role) ON public.office_members TO authenticated;
GRANT SELECT (
  accepted_at, accepted_by, created_at, email, expires_at, failed_accepts,
  id, invited_by, last_sent_at, office_id, revoked_at, role, send_attempts,
  send_error, send_status, status
) ON public.office_invitations TO authenticated;
GRANT USAGE ON SEQUENCE public.bookings_number_seq, public.requests_number_seq
TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.accept_invitation(text),
  public.create_invitation(uuid, text, public.app_role),
  public.create_office(text, text, text, text, text),
  public.mark_invitation_sent(uuid, text, text),
  public.platform_stats(), public.resend_invitation(uuid),
  public.revoke_invitation(uuid), public.set_member_status(uuid, uuid, text),
  public.team_last_activity(uuid), public.team_performance(uuid),
  public.is_office_admin(uuid), public.is_office_member(uuid),
  public.is_platform_owner(), public.shares_office(uuid)
TO authenticated;

-- Eliminate both global and per-schema additive defaults. No implicit access
-- for future tables/views, sequences or RPCs; future migrations must grant it.
DO $$
DECLARE creator text;
BEGIN
  FOREACH creator IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, sandbox_exec', creator);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, sandbox_exec', creator);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, sandbox_exec', creator);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, sandbox_exec', creator);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, sandbox_exec', creator);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, sandbox_exec', creator);
  END LOOP;
END $$;

-- Protect historical identity through all ordinary DML paths, including
-- definer RPC updates. Accepted reinvitations update only status/role.
CREATE FUNCTION public.guard_membership_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Membership history must be retained; use removal status' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.office_id, NEW.user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.office_id, OLD.user_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_membership_identity()
FROM PUBLIC, anon, authenticated, sandbox_exec;
CREATE TRIGGER members_identity_immutable BEFORE UPDATE OR DELETE
ON public.office_members FOR EACH ROW EXECUTE FUNCTION public.guard_membership_identity();

-- TRUNCATE ignores row triggers and RLS; protect against privileged mistakes
-- too. Teardown must destroy the entire ephemeral instance, not delete history.
CREATE TRIGGER members_no_truncate BEFORE TRUNCATE ON public.office_members
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_activity_immutable();
CREATE TRIGGER activity_no_truncate BEFORE TRUNCATE ON public.activity_log
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_activity_immutable();

-- Keep the existing locked last-admin guard unchanged. Owner/superuser ability
-- to alter/disable triggers remains outside the unprivileged-client boundary.
COMMIT;
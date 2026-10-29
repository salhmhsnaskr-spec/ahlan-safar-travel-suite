-- Membership status: active / suspended / removed (rows are kept so historical attribution survives)
ALTER TABLE public.office_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.office_members ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE public.office_members ADD CONSTRAINT office_members_status_check CHECK (status IN ('active','suspended','removed'));

CREATE OR REPLACE FUNCTION public.is_office_member(_office uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists(select 1 from public.office_members where office_id = _office and user_id = auth.uid() and status = 'active') $$;

CREATE OR REPLACE FUNCTION public.is_office_admin(_office uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists(select 1 from public.office_members where office_id = _office and user_id = auth.uid() and role = 'admin' and status = 'active') $$;

-- Caller must be active; colleague may be in any status so former staff names stay readable.
CREATE OR REPLACE FUNCTION public.shares_office(_user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists(select 1 from public.office_members a join public.office_members b on a.office_id = b.office_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = _user) $$;

-- A user can always read their own membership rows (to see a suspension notice).
CREATE POLICY "members select own" ON public.office_members FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Memberships are created only by create_office or accept_invitation.
DROP POLICY IF EXISTS "members admin insert" ON public.office_members;

-- Last ACTIVE admin guard: covers demotion, suspension, removal, delete and office move.
CREATE OR REPLACE FUNCTION public.guard_last_office_admin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE remaining_admin uuid;
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'active' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.role = 'admin' AND NEW.status = 'active' AND NEW.office_id = OLD.office_id THEN RETURN NEW; END IF;
    END IF;
    PERFORM id FROM public.offices WHERE id = OLD.office_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Office not found' USING ERRCODE = '42501'; END IF;
    SELECT id INTO remaining_admin FROM public.office_members
    WHERE office_id = OLD.office_id AND role = 'admin' AND status = 'active' AND id <> OLD.id
    ORDER BY id LIMIT 1 FOR UPDATE;
    IF remaining_admin IS NULL THEN
      RAISE EXCEPTION 'لا يمكن إزالة أو إيقاف أو تخفيض صلاحية آخر مدير نشط للمكتب. أضف مديرًا آخر أولًا.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- Direct add without consent is retired; invitations replace it.
CREATE OR REPLACE FUNCTION public.add_office_member(_office uuid, _email text, _role app_role DEFAULT 'employee'::app_role)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ begin raise exception 'Direct member adding is disabled; send an invitation instead' using errcode = '42501'; end $$;
COMMENT ON FUNCTION public.add_office_member(uuid, text, app_role) IS 'DEPRECATED: replaced by create_invitation/accept_invitation';

-- Admin-only status changes with audit entry.
CREATE OR REPLACE FUNCTION public.set_member_status(_office uuid, _user uuid, _status text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare _old text;
begin
  if not public.is_office_admin(_office) then raise exception 'Only office admins can change members' using errcode = '42501'; end if;
  if _status not in ('active','suspended','removed') then raise exception 'Invalid status'; end if;
  select status into _old from public.office_members where office_id = _office and user_id = _user for update;
  if _old is null then raise exception 'Member not found'; end if;
  if _old = 'removed' and _status <> 'removed' then raise exception 'Removed members must be re-invited'; end if;
  update public.office_members set status = _status, status_changed_at = now() where office_id = _office and user_id = _user;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_office, auth.uid(), 'office_members', _user, 'member_' || _status, _old || '→' || _status);
end $$;

-- Invitations: token stored only as sha256 hash.
CREATE TABLE public.office_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL,
  send_status text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending','sent','failed','not_configured')),
  send_error text,
  send_attempts int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  failed_accepts int NOT NULL DEFAULT 0,
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX office_invitations_one_pending ON public.office_invitations (office_id, lower(email)) WHERE status = 'pending';
GRANT SELECT ON public.office_invitations TO authenticated;
GRANT ALL ON public.office_invitations TO service_role;
ALTER TABLE public.office_invitations ENABLE ROW LEVEL SECURITY;
-- token_hash is never selectable by the app
REVOKE SELECT (token_hash) ON public.office_invitations FROM authenticated;
CREATE POLICY "invitations admin select" ON public.office_invitations FOR SELECT TO authenticated USING (public.is_office_admin(office_id));

CREATE OR REPLACE FUNCTION public._invite_hash(_token text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions'
AS $$ select encode(extensions.digest(_token, 'sha256'), 'hex') $$;
REVOKE ALL ON FUNCTION public._invite_hash(text) FROM PUBLIC, anon, authenticated;

-- Returns the raw token once to the inviting admin so it can be emailed; never stored.
CREATE OR REPLACE FUNCTION public.create_invitation(_office uuid, _email text, _role public.app_role DEFAULT 'employee')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
declare _mail text := lower(trim(_email)); _token text; _id uuid;
begin
  if not public.is_office_admin(_office) then raise exception 'Only office admins can invite' using errcode = '42501'; end if;
  if _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('error','invalid_email'); end if;
  if exists (select 1 from public.office_members m join auth.users u on u.id = m.user_id
             where m.office_id = _office and lower(u.email) = _mail and m.status <> 'removed') then
    return jsonb_build_object('error','already_member'); end if;
  -- expire stale pending invite so a fresh one can be created
  update public.office_invitations set status = 'revoked', revoked_at = now()
   where office_id = _office and lower(email) = _mail and status = 'pending' and expires_at < now();
  if exists (select 1 from public.office_invitations where office_id = _office and lower(email) = _mail and status = 'pending') then
    return jsonb_build_object('error','already_invited'); end if;
  _token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.office_invitations(office_id, email, role, token_hash, expires_at, invited_by)
  values (_office, _mail, coalesce(_role,'employee'), public._invite_hash(_token), now() + interval '72 hours', auth.uid())
  returning id into _id;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_office, auth.uid(), 'invitations', _id, 'created', _mail);
  return jsonb_build_object('id', _id, 'token', _token);
end $$;

CREATE OR REPLACE FUNCTION public.resend_invitation(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
declare _inv public.office_invitations; _token text;
begin
  select * into _inv from public.office_invitations where id = _id for update;
  if _inv.id is null or not public.is_office_admin(_inv.office_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _inv.status <> 'pending' then return jsonb_build_object('error','not_pending'); end if;
  if _inv.last_sent_at is not null and _inv.last_sent_at > now() - interval '60 seconds' then
    return jsonb_build_object('error','too_soon'); end if;
  _token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.office_invitations set token_hash = public._invite_hash(_token), expires_at = now() + interval '72 hours',
    failed_accepts = 0, send_status = 'pending', send_error = null where id = _id;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_inv.office_id, auth.uid(), 'invitations', _id, 'resent', _inv.email);
  return jsonb_build_object('id', _id, 'token', _token);
end $$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare _inv public.office_invitations;
begin
  select * into _inv from public.office_invitations where id = _id for update;
  if _inv.id is null or not public.is_office_admin(_inv.office_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _inv.status <> 'pending' then return; end if;
  update public.office_invitations set status = 'revoked', revoked_at = now() where id = _id;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_inv.office_id, auth.uid(), 'invitations', _id, 'revoked', _inv.email);
end $$;

-- Records the delivery outcome; only increments attempts, so retries never create new invitations.
CREATE OR REPLACE FUNCTION public.mark_invitation_sent(_id uuid, _status text, _error text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare _office uuid;
begin
  select office_id into _office from public.office_invitations where id = _id;
  if _office is null or not public.is_office_admin(_office) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _status not in ('sent','failed','not_configured') then raise exception 'Invalid status'; end if;
  update public.office_invitations set send_status = _status, send_error = left(_error, 300),
    send_attempts = send_attempts + 1, last_sent_at = now() where id = _id;
end $$;

-- Public preview for the invite page: no email/token details beyond what the holder needs.
CREATE OR REPLACE FUNCTION public.invitation_preview(_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare _inv public.office_invitations; _name text;
begin
  if _token is null or length(_token) <> 64 then return jsonb_build_object('state','invalid'); end if;
  select * into _inv from public.office_invitations where token_hash = public._invite_hash(_token);
  if _inv.id is null then return jsonb_build_object('state','invalid'); end if;
  select name into _name from public.offices where id = _inv.office_id;
  return jsonb_build_object(
    'state', case when _inv.status = 'pending' and _inv.expires_at < now() then 'expired' else _inv.status end,
    'office_name', _name, 'role', _inv.role, 'email', _inv.email, 'expires_at', _inv.expires_at);
end $$;

-- Atomic acceptance: row lock + unique(office_id,user_id); never touches other offices' memberships.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare _inv public.office_invitations; _uid uuid := auth.uid(); _mail text; _confirmed timestamptz; _existing text;
begin
  if _uid is null then return jsonb_build_object('error','not_signed_in'); end if;
  if _token is null or length(_token) <> 64 then return jsonb_build_object('error','invalid'); end if;
  select * into _inv from public.office_invitations where token_hash = public._invite_hash(_token) for update;
  if _inv.id is null then return jsonb_build_object('error','invalid'); end if;
  if _inv.status = 'accepted' then return jsonb_build_object('error','used'); end if;
  if _inv.status = 'revoked' then return jsonb_build_object('error','revoked'); end if;
  if _inv.expires_at < now() then return jsonb_build_object('error','expired'); end if;
  select lower(email), email_confirmed_at into _mail, _confirmed from auth.users where id = _uid;
  if _confirmed is null then return jsonb_build_object('error','email_unconfirmed'); end if;
  if _mail is distinct from lower(_inv.email) then
    update public.office_invitations set failed_accepts = failed_accepts + 1,
      status = case when failed_accepts + 1 >= 5 then 'revoked' else status end,
      revoked_at = case when failed_accepts + 1 >= 5 then now() else revoked_at end
     where id = _inv.id;
    return jsonb_build_object('error','email_mismatch');
  end if;
  insert into public.profiles(id, email) values (_uid, _mail) on conflict (id) do nothing;
  select status into _existing from public.office_members where office_id = _inv.office_id and user_id = _uid for update;
  if _existing = 'active' or _existing = 'suspended' then
    update public.office_invitations set status = 'accepted', accepted_by = _uid, accepted_at = now() where id = _inv.id;
    return jsonb_build_object('error','already_member', 'office_id', _inv.office_id);
  elsif _existing = 'removed' then
    update public.office_members set status = 'active', role = _inv.role, status_changed_at = now()
     where office_id = _inv.office_id and user_id = _uid;
  else
    insert into public.office_members(office_id, user_id, role) values (_inv.office_id, _uid, _inv.role);
  end if;
  update public.office_invitations set status = 'accepted', accepted_by = _uid, accepted_at = now() where id = _inv.id;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_inv.office_id, _uid, 'invitations', _inv.id, 'accepted', _mail);
  return jsonb_build_object('ok', true, 'office_id', _inv.office_id);
end $$;

REVOKE ALL ON FUNCTION public.create_invitation(uuid, text, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resend_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_invitation_sent(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_member_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, text, public.app_role), public.resend_invitation(uuid), public.revoke_invitation(uuid),
  public.mark_invitation_sent(uuid, text, text), public.accept_invitation(text), public.set_member_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated;
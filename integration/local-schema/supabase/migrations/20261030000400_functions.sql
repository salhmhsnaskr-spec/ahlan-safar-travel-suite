-- LOCAL REBUILD ONLY. Captured via read-only catalogs 2026-10-30. No application rows.
SET search_path = public, extensions, pg_catalog;
CREATE OR REPLACE FUNCTION public._invite_hash(_token text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$ select encode(extensions.digest(_token, 'sha256'), 'hex') $function$
;
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.add_office_member(_office uuid, _email text, _role app_role DEFAULT 'employee'::app_role)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin raise exception 'Direct member adding is disabled; send an invitation instead' using errcode = '42501'; end $function$
;
CREATE OR REPLACE FUNCTION public.audit_safe_values(_row jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
SELECT coalesce(jsonb_object_agg(key,value), '{}'::jsonb) FROM jsonb_each(_row) WHERE key = ANY(ARRAY['id','office_id','number','status','role','user_id','source','priority','assigned_to','assigned_employee_id','customer_id','request_id','booking_id','service_id','referring_partner_id','trip_id','task_type','service_date','due_at','arrival_at','planned_start','planned_end','planned_entry','planned_exit','actual_entry','actual_exit','created_by','updated_by','completed_by','completed_at','cancelled_by','cancelled_at','created_at','updated_at','status_changed_at','is_active','sort_order','size_bytes','mime_type']); $function$
;
CREATE OR REPLACE FUNCTION public.check_booking_task_refs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _assignee uuid;
begin
  if new.customer_id is not null and not exists(select 1 from public.customers where id = new.customer_id and office_id = new.office_id) then
    raise exception 'Customer does not belong to this office'; end if;
  if new.request_id is not null and not exists(select 1 from public.requests where id = new.request_id and office_id = new.office_id) then
    raise exception 'Request does not belong to this office'; end if;
  if new.service_id is not null and not exists(select 1 from public.services where id = new.service_id and (office_id is null or office_id = new.office_id)) then
    raise exception 'Service not available for this office'; end if;
  if tg_table_name = 'bookings' then
    _assignee := new.assigned_employee_id;
  else
    _assignee := new.assigned_to;
    if new.booking_id is not null and not exists(select 1 from public.bookings where id = new.booking_id and office_id = new.office_id) then
      raise exception 'Booking does not belong to this office'; end if;
  end if;
  if _assignee is not null and not exists(select 1 from public.office_members where user_id = _assignee and office_id = new.office_id) then
    raise exception 'Assignee is not a member of this office'; end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.check_document_refs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if split_part(new.storage_path, '/', 1) <> new.office_id::text then raise exception 'File path must start with the office id'; end if;
  if new.customer_id is not null and not exists(select 1 from public.customers where id = new.customer_id and office_id = new.office_id) then raise exception 'Customer does not belong to this office'; end if;
  if new.request_id is not null and not exists(select 1 from public.requests where id = new.request_id and office_id = new.office_id) then raise exception 'Request does not belong to this office'; end if;
  if new.booking_id is not null and not exists(select 1 from public.bookings where id = new.booking_id and office_id = new.office_id) then raise exception 'Booking does not belong to this office'; end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.check_office_refs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.referring_partner_id is not null and not exists(select 1 from public.partner_offices where id = new.referring_partner_id and office_id = new.office_id) then
    raise exception 'Partner office does not belong to this office';
  end if;
  if new.assigned_to is not null and not exists(select 1 from public.office_members where user_id = new.assigned_to and office_id = new.office_id) then
    raise exception 'Assignee is not a member of this office';
  end if;
  if tg_table_name = 'requests' then
    if not exists(select 1 from public.customers where id = new.customer_id and office_id = new.office_id) then
      raise exception 'Customer does not belong to this office';
    end if;
    if new.service_id is not null and not exists(select 1 from public.services where id = new.service_id and (office_id is null or office_id = new.office_id)) then
      raise exception 'Service not available for this office';
    end if;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.check_umrah_participant_refs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists(select 1 from public.umrah_trips where id = new.trip_id and office_id = new.office_id) then raise exception 'Trip does not belong to this office'; end if;
  if not exists(select 1 from public.customers where id = new.customer_id and office_id = new.office_id) then raise exception 'Customer does not belong to this office'; end if;
  if new.request_id is not null and not exists(select 1 from public.requests where id = new.request_id and office_id = new.office_id and customer_id = new.customer_id) then raise exception 'Request does not belong to this pilgrim'; end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.create_invitation(_office uuid, _email text, _role app_role DEFAULT 'employee'::app_role)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.create_office(_name text, _phone text DEFAULT NULL::text, _email text DEFAULT NULL::text, _country text DEFAULT NULL::text, _city text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(_name),'') = '' then raise exception 'Office name required'; end if;
  insert into public.offices(name, phone, email, country, city, created_by) values (trim(_name), _phone, _email, _country, _city, auth.uid()) returning id into _id;
  insert into public.office_members(office_id, user_id, role) values (_id, auth.uid(), 'admin');
  return _id;
end $function$
;
CREATE OR REPLACE FUNCTION public.guard_activity_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN RAISE EXCEPTION 'Activity history is immutable' USING ERRCODE='42501'; END $function$
;
CREATE OR REPLACE FUNCTION public.guard_last_office_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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
$function$
;
CREATE OR REPLACE FUNCTION public.guard_task_employee_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF public.is_office_admin(OLD.office_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'notes', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'notes', 'updated_at']) THEN
    RAISE EXCEPTION 'Employees can only update task status and notes' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := OLD.updated_at;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.invitation_preview(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _inv public.office_invitations; _name text;
begin
  if _token is null or length(_token) <> 64 then return jsonb_build_object('state','invalid'); end if;
  select * into _inv from public.office_invitations where token_hash = public._invite_hash(_token);
  if _inv.id is null then return jsonb_build_object('state','invalid'); end if;
  select name into _name from public.offices where id = _inv.office_id;
  return jsonb_build_object(
    'state', case when _inv.status = 'pending' and _inv.expires_at < now() then 'expired' else _inv.status end,
    'office_name', _name, 'role', _inv.role, 'email', _inv.email, 'expires_at', _inv.expires_at);
end $function$
;
CREATE OR REPLACE FUNCTION public.is_office_admin(_office uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.office_members where office_id = _office and user_id = auth.uid() and role = 'admin' and status = 'active') $function$
;
CREATE OR REPLACE FUNCTION public.is_office_member(_office uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.office_members where office_id = _office and user_id = auth.uid() and status = 'active') $function$
;
CREATE OR REPLACE FUNCTION public.is_platform_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.platform_owners where user_id = auth.uid())
$function$
;
CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r jsonb; before_row jsonb; after_row jsonb; act text; label text; previous_status text; current_status text; fields text[];
BEGIN
IF TG_OP = 'DELETE' THEN before_row := to_jsonb(OLD); r := before_row; act := 'deleted';
ELSIF TG_OP = 'INSERT' THEN after_row := to_jsonb(NEW); r := after_row; act := 'created';
ELSE before_row := to_jsonb(OLD); after_row := to_jsonb(NEW); r := after_row; act := 'updated'; previous_status := before_row->>'status'; current_status := after_row->>'status';
IF previous_status IS DISTINCT FROM current_status THEN act := CASE WHEN current_status IN ('completed','done') THEN 'completed' WHEN current_status = 'cancelled' THEN 'cancelled' WHEN previous_status IN ('completed','done') THEN 'reopened' ELSE 'status' END; END IF; END IF;
SELECT array_agg(key ORDER BY key) INTO fields FROM jsonb_object_keys(coalesce(before_row,'{}'::jsonb) || coalesce(after_row,'{}'::jsonb)) key WHERE (before_row->key) IS DISTINCT FROM (after_row->key);
label := CASE TG_TABLE_NAME WHEN 'customers' THEN 'عميل' WHEN 'requests' THEN 'REQ-' || lpad(r->>'number',4,'0') WHEN 'bookings' THEN 'BK-' || lpad(r->>'number',4,'0') WHEN 'tasks' THEN 'مهمة' WHEN 'documents' THEN 'وثيقة' WHEN 'umrah_trips' THEN 'رحلة عمرة' WHEN 'umrah_participants' THEN 'معتمر' END;
IF EXISTS(SELECT 1 FROM public.offices WHERE id = (r->>'office_id')::uuid) THEN
INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary,old_values,new_values,result,actor_name,changed_fields) VALUES ((r->>'office_id')::uuid,auth.uid(),TG_TABLE_NAME,(r->>'id')::uuid,act,coalesce(label,TG_TABLE_NAME),CASE WHEN before_row IS NOT NULL THEN public.audit_safe_values(before_row) END,CASE WHEN after_row IS NOT NULL THEN public.audit_safe_values(after_row) END,'success',(SELECT full_name FROM public.profiles WHERE id=auth.uid()),fields); END IF; RETURN NULL; END $function$
;
CREATE OR REPLACE FUNCTION public.mark_invitation_sent(_id uuid, _status text, _error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _office uuid;
begin
  select office_id into _office from public.office_invitations where id = _id for update;
  if _office is null or not public.is_office_admin(_office) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _status not in ('manual_link','not_configured','send_attempted','failed') then raise exception 'Invalid status' using errcode = '22023'; end if;
  update public.office_invitations set send_status = _status, send_error = left(_error, 300),
    send_attempts = send_attempts + case when _status in ('send_attempted','failed') then 1 else 0 end,
    last_sent_at = case when _status in ('send_attempted','failed') then now() else last_sent_at end
   where id = _id;
end $function$
;
CREATE OR REPLACE FUNCTION public.platform_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _r jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'offices', (select count(*) from offices),
    'active_offices_30d', (select count(*) from offices o where
        exists(select 1 from requests r where r.office_id = o.id and r.created_at > now() - interval '30 days')
        or exists(select 1 from bookings b where b.office_id = o.id and b.created_at > now() - interval '30 days')
        or exists(select 1 from customers c where c.office_id = o.id and c.created_at > now() - interval '30 days')),
    'customers', (select count(*) from customers),
    'requests_total', (select count(*) from requests),
    'requests_cancelled', (select count(*) from requests where status = 'cancelled'),
    'bookings_total', (select count(*) from bookings),
    'bookings_cancelled', (select count(*) from bookings where status = 'cancelled'),
    'monthly', (select coalesce(jsonb_agg(m order by m->>'month'), '[]'::jsonb) from (
        select jsonb_build_object(
          'month', to_char(g, 'YYYY-MM'),
          'offices', (select count(*) from offices where date_trunc('month', created_at) = g),
          'customers', (select count(*) from customers where date_trunc('month', created_at) = g),
          'requests', (select count(*) from requests where date_trunc('month', created_at) = g),
          'bookings', (select count(*) from bookings where date_trunc('month', created_at) = g)) m
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') g) s),
    'recent_offices', (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
        select jsonb_build_object('id', o.id, 'name', o.name, 'city', o.city, 'country', o.country, 'created_at', o.created_at,
          'members', (select count(*) from office_members m where m.office_id = o.id)) x
        from offices o order by o.created_at desc limit 10) t)
  ) into _r;
  return _r;
end $function$
;
CREATE OR REPLACE FUNCTION public.resend_invitation(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare _inv public.office_invitations; _token text;
begin
  select * into _inv from public.office_invitations where id = _id for update;
  if _inv.id is null or not public.is_office_admin(_inv.office_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _inv.status <> 'pending' then return jsonb_build_object('error','not_pending'); end if;
  if greatest(_inv.created_at, coalesce(_inv.last_rotated_at, _inv.created_at), coalesce(_inv.last_sent_at, _inv.created_at)) > now() - interval '60 seconds' then
    return jsonb_build_object('error','too_soon'); end if;
  if _inv.rotation_count >= 5 then return jsonb_build_object('error','rotation_limit'); end if;
  _token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.office_invitations set token_hash = public._invite_hash(_token), expires_at = now() + interval '72 hours',
    failed_accepts = 0, send_status = 'pending', send_error = null,
    rotation_count = rotation_count + 1, last_rotated_at = now() where id = _id;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_inv.office_id, auth.uid(), 'invitations', _id, 'resent', _inv.email);
  return jsonb_build_object('id', _id, 'token', _token);
end $function$
;
CREATE OR REPLACE FUNCTION public.revoke_invitation(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _inv public.office_invitations;
begin
  select * into _inv from public.office_invitations where id = _id for update;
  if _inv.id is null or not public.is_office_admin(_inv.office_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _inv.status <> 'pending' then return; end if;
  update public.office_invitations set status = 'revoked', revoked_at = now() where id = _id;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_inv.office_id, auth.uid(), 'invitations', _id, 'revoked', _inv.email);
end $function$
;
CREATE OR REPLACE FUNCTION public.set_member_status(_office uuid, _user uuid, _status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.shares_office(_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.office_members a join public.office_members b on a.office_id = b.office_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = _user) $function$
;
CREATE OR REPLACE FUNCTION public.stamp_activity_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN NEW.actor_id := auth.uid(); NEW.actor_name := (SELECT full_name FROM public.profiles WHERE id=auth.uid()); NEW.result := 'success'; NEW.created_at := now(); RETURN NEW; END $function$
;
CREATE OR REPLACE FUNCTION public.stamp_work_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); NEW.updated_by := NULL;
ELSE NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at; NEW.updated_by := auth.uid(); END IF;
IF TG_TABLE_NAME IN ('requests','bookings') THEN
IF TG_OP = 'INSERT' THEN
NEW.completed_by := NULL; NEW.completed_at := NULL; NEW.cancelled_by := NULL; NEW.cancelled_at := NULL;
IF NEW.status::text = 'completed' THEN NEW.completed_by := auth.uid(); NEW.completed_at := now();
ELSIF NEW.status::text = 'cancelled' THEN NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now(); END IF;
ELSE
NEW.completed_by := OLD.completed_by; NEW.completed_at := OLD.completed_at; NEW.cancelled_by := OLD.cancelled_by; NEW.cancelled_at := OLD.cancelled_at;
IF NEW.status IS DISTINCT FROM OLD.status THEN
NEW.completed_by := NULL; NEW.completed_at := NULL; NEW.cancelled_by := NULL; NEW.cancelled_at := NULL;
IF NEW.status::text = 'completed' THEN NEW.completed_by := auth.uid(); NEW.completed_at := now();
ELSIF NEW.status::text = 'cancelled' THEN NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now(); END IF;
END IF; END IF; END IF; RETURN NEW; END $function$
;
CREATE OR REPLACE FUNCTION public.team_last_activity(_office uuid)
 RETURNS TABLE(user_id uuid, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF NOT public.is_office_admin(_office) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF; RETURN QUERY SELECT m.user_id, max(a.created_at) FROM public.office_members m LEFT JOIN public.activity_log a ON a.office_id = m.office_id AND a.actor_id = m.user_id WHERE m.office_id = _office GROUP BY m.user_id; END; $function$
;
CREATE OR REPLACE FUNCTION public.team_performance(_office uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _admin boolean; _result jsonb;
BEGIN
 IF _uid IS NULL OR NOT public.is_office_member(_office) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 _admin := public.is_office_admin(_office);
 WITH work AS (
 SELECT 'customers'::text entity, id, full_name label, NULL::text status, NULL::uuid service_id, created_by, created_at, NULL::uuid completed_by, NULL::timestamptz completed_at, NULL::uuid cancelled_by, NULL::timestamptz cancelled_at, NULL::uuid assigned FROM public.customers WHERE office_id=_office
 UNION ALL SELECT 'requests',id,'REQ-'||lpad(number::text,4,'0'),status::text,service_id,created_by,created_at,completed_by,completed_at,cancelled_by,cancelled_at,assigned_to FROM public.requests WHERE office_id=_office
 UNION ALL SELECT 'bookings',id,'BK-'||lpad(number::text,4,'0'),status::text,service_id,created_by,created_at,completed_by,completed_at,cancelled_by,cancelled_at,assigned_employee_id FROM public.bookings WHERE office_id=_office
 ), entries AS (
 SELECT entity||'_created' metric,created_by actor_id,entity,id entity_id,label,status,created_at at,service_id FROM work
 UNION ALL SELECT entity||'_completed',completed_by,entity,id,label,status,coalesce(completed_at,created_at),service_id FROM work WHERE status='completed'
 UNION ALL SELECT entity||'_cancelled',cancelled_by,entity,id,label,status,coalesce(cancelled_at,created_at),service_id FROM work WHERE status='cancelled'
 UNION ALL SELECT entity||'_pending',assigned,entity,id,label,status,created_at,service_id FROM work WHERE entity IN ('requests','bookings') AND status NOT IN ('completed','cancelled')
 UNION ALL SELECT 'modifications',a.actor_id,a.entity,a.entity_id,coalesce(a.summary,a.entity),coalesce(w.status,a.new_values->>'status'),a.created_at,w.service_id FROM public.activity_log a LEFT JOIN work w ON w.entity=a.entity AND w.id=a.entity_id WHERE a.office_id=_office AND a.action IN ('updated','status','completed','cancelled','reopened') AND a.entity_id IS NOT NULL AND (a.result='success' OR a.result IS NULL)
 ) SELECT jsonb_build_object(
 'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'full_name',coalesce(p.full_name,(SELECT a.actor_name FROM public.activity_log a WHERE a.office_id=_office AND a.actor_id=m.user_id AND a.actor_name IS NOT NULL ORDER BY a.created_at DESC LIMIT 1)),'status',m.status,'role',m.role,'last_activity_at',(SELECT max(a.created_at) FROM public.activity_log a WHERE a.office_id=_office AND a.actor_id=m.user_id))), '[]'::jsonb) FROM public.office_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.office_id=_office AND (_admin OR m.user_id=_uid)),
 'entries',(SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM entries e WHERE _admin OR e.actor_id=_uid),
 'activity',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor_id',a.actor_id,'actor_name',a.actor_name,'entity',a.entity,'entity_id',a.entity_id,'action',a.action,'created_at',a.created_at) ORDER BY a.created_at DESC), '[]'::jsonb) FROM public.activity_log a WHERE a.office_id=_office AND (_admin OR a.actor_id=_uid))
 ) INTO _result;
 RETURN _result;
END $function$
;
ALTER FUNCTION public."_invite_hash"(_token text) OWNER TO "postgres";
ALTER FUNCTION public."accept_invitation"(_token text) OWNER TO "postgres";
ALTER FUNCTION public."add_office_member"(_office uuid, _email text, _role app_role) OWNER TO "postgres";
ALTER FUNCTION public."audit_safe_values"(_row jsonb) OWNER TO "postgres";
ALTER FUNCTION public."check_booking_task_refs"() OWNER TO "postgres";
ALTER FUNCTION public."check_document_refs"() OWNER TO "postgres";
ALTER FUNCTION public."check_office_refs"() OWNER TO "postgres";
ALTER FUNCTION public."check_umrah_participant_refs"() OWNER TO "postgres";
ALTER FUNCTION public."create_invitation"(_office uuid, _email text, _role app_role) OWNER TO "postgres";
ALTER FUNCTION public."create_office"(_name text, _phone text, _email text, _country text, _city text) OWNER TO "postgres";
ALTER FUNCTION public."guard_activity_immutable"() OWNER TO "postgres";
ALTER FUNCTION public."guard_last_office_admin"() OWNER TO "postgres";
ALTER FUNCTION public."guard_task_employee_update"() OWNER TO "postgres";
ALTER FUNCTION public."invitation_preview"(_token text) OWNER TO "postgres";
ALTER FUNCTION public."is_office_admin"(_office uuid) OWNER TO "postgres";
ALTER FUNCTION public."is_office_member"(_office uuid) OWNER TO "postgres";
ALTER FUNCTION public."is_platform_owner"() OWNER TO "postgres";
ALTER FUNCTION public."log_activity"() OWNER TO "postgres";
ALTER FUNCTION public."mark_invitation_sent"(_id uuid, _status text, _error text) OWNER TO "postgres";
ALTER FUNCTION public."platform_stats"() OWNER TO "postgres";
ALTER FUNCTION public."resend_invitation"(_id uuid) OWNER TO "postgres";
ALTER FUNCTION public."revoke_invitation"(_id uuid) OWNER TO "postgres";
ALTER FUNCTION public."set_member_status"(_office uuid, _user uuid, _status text) OWNER TO "postgres";
ALTER FUNCTION public."set_updated_at"() OWNER TO "postgres";
ALTER FUNCTION public."shares_office"(_user uuid) OWNER TO "postgres";
ALTER FUNCTION public."stamp_activity_result"() OWNER TO "postgres";
ALTER FUNCTION public."stamp_work_actor"() OWNER TO "postgres";
ALTER FUNCTION public."team_last_activity"(_office uuid) OWNER TO "postgres";
ALTER FUNCTION public."team_performance"(_office uuid) OWNER TO "postgres";
COMMENT ON FUNCTION public."add_office_member"(_office uuid, _email text, _role app_role) IS 'DEPRECATED: replaced by create_invitation/accept_invitation';

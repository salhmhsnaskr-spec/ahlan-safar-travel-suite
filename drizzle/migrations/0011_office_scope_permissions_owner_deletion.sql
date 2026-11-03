
-- 1. Least privilege: no TRUNCATE/TRIGGER/REFERENCES for app roles
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- 2. Office identity
ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS location_url text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_partner boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_office_partner_flag() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_partner IS DISTINCT FROM OLD.is_partner AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the platform owner can classify offices' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN NEW.created_by := OLD.created_by; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offices_partner_guard BEFORE UPDATE ON public.offices FOR EACH ROW EXECUTE FUNCTION public.guard_office_partner_flag();

-- 3. Record-scoped permissions
CREATE TABLE public.work_record_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  entity text NOT NULL CHECK (entity IN ('customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips')),
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('edit','delete')),
  grantee_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity, record_id, operation, grantee_id)
);
GRANT SELECT ON public.work_record_permissions TO authenticated;
GRANT ALL ON public.work_record_permissions TO service_role;
ALTER TABLE public.work_record_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work permissions select" ON public.work_record_permissions FOR SELECT TO authenticated USING (public.is_office_member(office_id));

CREATE OR REPLACE FUNCTION public.work_owner(_entity text, _id uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid; c uuid; q uuid; b uuid; up uuid;
BEGIN
  IF _entity = 'customers' THEN SELECT coalesce(assigned_to, created_by) INTO r FROM public.customers WHERE id = _id;
  ELSIF _entity = 'requests' THEN SELECT coalesce(assigned_to, created_by) INTO r FROM public.requests WHERE id = _id;
  ELSIF _entity = 'bookings' THEN SELECT coalesce(assigned_employee_id, created_by) INTO r FROM public.bookings WHERE id = _id;
  ELSIF _entity = 'tasks' THEN SELECT coalesce(assigned_to, created_by) INTO r FROM public.tasks WHERE id = _id;
  ELSIF _entity = 'umrah_trips' THEN SELECT created_by INTO r FROM public.umrah_trips WHERE id = _id;
  ELSIF _entity = 'umrah_participants' THEN
    SELECT coalesce(cu.assigned_to, cu.created_by) INTO r FROM public.umrah_participants p JOIN public.customers cu ON cu.id = p.customer_id WHERE p.id = _id;
  ELSIF _entity = 'documents' THEN
    SELECT customer_id, request_id, booking_id, uploaded_by INTO c, q, b, up FROM public.documents WHERE id = _id;
    IF b IS NOT NULL THEN r := public.work_owner('bookings', b);
    ELSIF q IS NOT NULL THEN r := public.work_owner('requests', q);
    ELSIF c IS NOT NULL THEN r := public.work_owner('customers', c);
    ELSE r := up; END IF;
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.work_allowed(_office uuid, _entity text, _id uuid, _op text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_office_admin(_office) OR (public.is_office_member(_office) AND (
    public.work_owner(_entity, _id) = auth.uid() OR EXISTS (
      SELECT 1 FROM public.work_record_permissions p WHERE p.office_id = _office AND p.entity = _entity AND p.record_id = _id
        AND p.operation = _op AND p.grantee_id = auth.uid() AND p.owner_id IS NOT DISTINCT FROM public.work_owner(_entity, _id))))
$$;

CREATE OR REPLACE FUNCTION public.set_work_permission(_office uuid, _entity text, _record uuid, _grantee uuid, _operation text, _allow boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _rec_office uuid;
BEGIN
  IF _entity NOT IN ('customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips') OR _operation NOT IN ('edit','delete') THEN
    RAISE EXCEPTION 'Invalid permission' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_office_member(_office) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  EXECUTE format('SELECT office_id FROM public.%I WHERE id = $1', _entity) INTO _rec_office USING _record;
  IF _rec_office IS DISTINCT FROM _office THEN RAISE EXCEPTION 'Record not in this office' USING ERRCODE = '42501'; END IF;
  _owner := public.work_owner(_entity, _record);
  IF NOT (public.is_office_admin(_office) OR _owner = auth.uid()) THEN RAISE EXCEPTION 'Only the record owner or office admin can delegate' USING ERRCODE = '42501'; END IF;
  IF _grantee = auth.uid() THEN RAISE EXCEPTION 'Cannot grant yourself' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.office_members WHERE office_id = _office AND user_id = _grantee AND status = 'active') THEN
    RAISE EXCEPTION 'Grantee is not an active member' USING ERRCODE = '42501'; END IF;
  IF _allow THEN
    INSERT INTO public.work_record_permissions(office_id, entity, record_id, operation, grantee_id, granted_by, owner_id)
    VALUES (_office, _entity, _record, _operation, _grantee, auth.uid(), _owner)
    ON CONFLICT (entity, record_id, operation, grantee_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, granted_by = EXCLUDED.granted_by, created_at = now();
  ELSE
    DELETE FROM public.work_record_permissions WHERE entity = _entity AND record_id = _record AND operation = _operation AND grantee_id = _grantee;
  END IF;
  INSERT INTO public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  VALUES (_office, auth.uid(), 'work_permissions', _record, CASE WHEN _allow THEN 'permission_granted' ELSE 'permission_revoked' END, _entity || ':' || _operation);
END $$;

-- 4. Assignment guard: only admins assign work to colleagues or reassign
CREATE OR REPLACE FUNCTION public.guard_work_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new uuid; _old uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_office_admin(NEW.office_id) THEN RETURN NEW; END IF;
  _new := coalesce(to_jsonb(NEW)->>'assigned_employee_id', to_jsonb(NEW)->>'assigned_to')::uuid;
  IF TG_OP = 'INSERT' THEN
    IF _new IS NOT NULL AND _new <> auth.uid() THEN RAISE EXCEPTION 'إسناد العمل لزميل متاح لمدير المكتب فقط.' USING ERRCODE = '42501'; END IF;
  ELSE
    _old := coalesce(to_jsonb(OLD)->>'assigned_employee_id', to_jsonb(OLD)->>'assigned_to')::uuid;
    IF _new IS DISTINCT FROM _old THEN RAISE EXCEPTION 'إعادة الإسناد متاحة لمدير المكتب فقط.' USING ERRCODE = '42501'; END IF;
    IF NEW.office_id <> OLD.office_id THEN RAISE EXCEPTION 'Office cannot change' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customers_assignment BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_work_assignment();
CREATE TRIGGER requests_assignment BEFORE INSERT OR UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.guard_work_assignment();
CREATE TRIGGER bookings_assignment BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_work_assignment();
CREATE TRIGGER tasks_assignment BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.guard_work_assignment();

-- Tasks: policies now decide who edits; the old status/notes-only guard is retired.
CREATE OR REPLACE FUNCTION public.guard_task_employee_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN RETURN NEW; END $$;

-- Trip creator stamping
CREATE OR REPLACE FUNCTION public.stamp_trip_creator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); ELSE NEW.created_by := OLD.created_by; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER umrah_trips_creator BEFORE INSERT OR UPDATE ON public.umrah_trips FOR EACH ROW EXECUTE FUNCTION public.stamp_trip_creator();

-- 5. Policies: office-wide reads, owner/permission-scoped writes
DROP POLICY IF EXISTS "customers update" ON public.customers;
DROP POLICY IF EXISTS "customers delete" ON public.customers;
CREATE POLICY "customers update" ON public.customers FOR UPDATE TO authenticated USING (public.work_allowed(office_id, 'customers', id, 'edit')) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "customers delete" ON public.customers FOR DELETE TO authenticated USING (public.work_allowed(office_id, 'customers', id, 'delete'));

DROP POLICY IF EXISTS "requests update" ON public.requests;
DROP POLICY IF EXISTS "requests delete" ON public.requests;
CREATE POLICY "requests update" ON public.requests FOR UPDATE TO authenticated USING (public.work_allowed(office_id, 'requests', id, 'edit')) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "requests delete" ON public.requests FOR DELETE TO authenticated USING (public.work_allowed(office_id, 'requests', id, 'delete'));

DROP POLICY IF EXISTS "bookings update" ON public.bookings;
DROP POLICY IF EXISTS "bookings admin delete" ON public.bookings;
CREATE POLICY "bookings update" ON public.bookings FOR UPDATE TO authenticated USING (public.work_allowed(office_id, 'bookings', id, 'edit')) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "bookings delete" ON public.bookings FOR DELETE TO authenticated USING (public.work_allowed(office_id, 'bookings', id, 'delete'));

DROP POLICY IF EXISTS "tasks select" ON public.tasks;
DROP POLICY IF EXISTS "tasks admin insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks update" ON public.tasks;
DROP POLICY IF EXISTS "tasks admin delete" ON public.tasks;
CREATE POLICY "tasks select" ON public.tasks FOR SELECT TO authenticated USING (public.is_office_member(office_id));
CREATE POLICY "tasks insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "tasks update" ON public.tasks FOR UPDATE TO authenticated USING (public.work_allowed(office_id, 'tasks', id, 'edit')) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "tasks delete" ON public.tasks FOR DELETE TO authenticated USING (public.work_allowed(office_id, 'tasks', id, 'delete'));

DROP POLICY IF EXISTS "documents delete" ON public.documents;
CREATE POLICY "documents delete" ON public.documents FOR DELETE TO authenticated USING (public.work_allowed(office_id, 'documents', id, 'delete'));

DROP POLICY IF EXISTS "umrah trips update" ON public.umrah_trips;
DROP POLICY IF EXISTS "umrah trips admin delete" ON public.umrah_trips;
CREATE POLICY "umrah trips update" ON public.umrah_trips FOR UPDATE TO authenticated USING (public.work_allowed(office_id, 'umrah_trips', id, 'edit')) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "umrah trips delete" ON public.umrah_trips FOR DELETE TO authenticated USING (public.work_allowed(office_id, 'umrah_trips', id, 'delete'));

DROP POLICY IF EXISTS "umrah participants insert" ON public.umrah_participants;
DROP POLICY IF EXISTS "umrah participants update" ON public.umrah_participants;
DROP POLICY IF EXISTS "umrah participants delete" ON public.umrah_participants;
CREATE POLICY "umrah participants insert" ON public.umrah_participants FOR INSERT TO authenticated WITH CHECK (public.is_office_member(office_id) AND (public.work_allowed(office_id, 'customers', customer_id, 'edit') OR public.work_allowed(office_id, 'umrah_trips', trip_id, 'edit')));
CREATE POLICY "umrah participants update" ON public.umrah_participants FOR UPDATE TO authenticated USING (public.work_allowed(office_id, 'umrah_participants', id, 'edit') OR public.work_allowed(office_id, 'umrah_trips', trip_id, 'edit')) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "umrah participants delete" ON public.umrah_participants FOR DELETE TO authenticated USING (public.work_allowed(office_id, 'umrah_participants', id, 'delete') OR public.work_allowed(office_id, 'umrah_trips', trip_id, 'delete'));

DROP POLICY IF EXISTS "activity select" ON public.activity_log;
CREATE POLICY "activity select" ON public.activity_log FOR SELECT TO authenticated USING (public.is_office_member(office_id));

-- Roles change only through the RPC below
DROP POLICY IF EXISTS "members admin update" ON public.office_members;

CREATE OR REPLACE FUNCTION public.set_member_role(_office uuid, _user uuid, _role app_role) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old app_role;
BEGIN
  IF NOT public.is_office_admin(_office) THEN RAISE EXCEPTION 'Only office admins can change roles' USING ERRCODE = '42501'; END IF;
  SELECT role INTO _old FROM public.office_members WHERE office_id = _office AND user_id = _user AND status <> 'removed' FOR UPDATE;
  IF _old IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF _old = _role THEN RETURN; END IF;
  UPDATE public.office_members SET role = _role WHERE office_id = _office AND user_id = _user;
  INSERT INTO public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  VALUES (_office, auth.uid(), 'office_members', _user, 'role_changed', _old::text || '→' || _role::text);
END $$;

-- 6. Customer / document deletion jobs (DB rows removed atomically; file paths kept until Storage confirms removal)
CREATE TABLE public.deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('customer','document')),
  target_id uuid NOT NULL,
  paths text[] NOT NULL DEFAULT '{}',
  remaining text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'storage_pending' CHECK (status IN ('storage_pending','completed','storage_failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.deletion_jobs TO authenticated;
GRANT ALL ON public.deletion_jobs TO service_role;
ALTER TABLE public.deletion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deletion jobs select" ON public.deletion_jobs FOR SELECT TO authenticated USING (public.is_office_member(office_id) AND (public.is_office_admin(office_id) OR created_by = auth.uid()));

CREATE OR REPLACE FUNCTION public.begin_customer_deletion(_customer uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.customers; _req uuid[]; _bk uuid[]; _paths text[]; _job uuid;
BEGIN
  BEGIN
    SELECT * INTO _c FROM public.customers WHERE id = _customer FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'العميل قيد التعديل أو الحذف الآن، أعد المحاولة بعد لحظات.' USING ERRCODE = '55P03'; END;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'العميل غير موجود أو حُذف مسبقًا.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.work_allowed(_c.office_id, 'customers', _c.id, 'delete') THEN RAISE EXCEPTION 'لا تملك إذن حذف هذا العميل.' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(array_agg(id), '{}') INTO _req FROM public.requests WHERE customer_id = _c.id;
  SELECT coalesce(array_agg(id), '{}') INTO _bk FROM public.bookings WHERE customer_id = _c.id OR request_id = ANY(_req);
  BEGIN
    PERFORM 1 FROM public.requests WHERE id = ANY(_req) FOR UPDATE NOWAIT;
    PERFORM 1 FROM public.bookings WHERE id = ANY(_bk) FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'أحد سجلات العميل قيد التعديل الآن، أعد المحاولة بعد لحظات.' USING ERRCODE = '55P03'; END;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = ANY(_bk) AND customer_id <> _c.id)
     OR EXISTS (SELECT 1 FROM public.tasks WHERE (request_id = ANY(_req) OR booking_id = ANY(_bk)) AND customer_id IS NOT NULL AND customer_id <> _c.id)
     OR EXISTS (SELECT 1 FROM public.documents WHERE (request_id = ANY(_req) OR booking_id = ANY(_bk)) AND customer_id IS NOT NULL AND customer_id <> _c.id)
     OR EXISTS (SELECT 1 FROM public.umrah_participants WHERE request_id = ANY(_req) AND customer_id <> _c.id) THEN
    RAISE EXCEPTION 'علاقات العميل مرتبطة بعميل آخر؛ لم يبدأ الحذف.' USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(array_agg(DISTINCT storage_path), '{}') INTO _paths FROM public.documents
   WHERE customer_id = _c.id OR request_id = ANY(_req) OR booking_id = ANY(_bk);
  IF EXISTS (SELECT 1 FROM public.documents d WHERE d.storage_path = ANY(_paths)
     AND NOT (d.customer_id IS NOT DISTINCT FROM _c.id OR d.request_id = ANY(_req) OR d.booking_id = ANY(_bk))) THEN
    RAISE EXCEPTION 'يوجد ملف مشترك مع سجل آخر؛ لم يبدأ الحذف.' USING ERRCODE = '23503';
  END IF;
  INSERT INTO public.deletion_jobs(office_id, kind, target_id, paths, remaining, created_by, status)
  VALUES (_c.office_id, 'customer', _c.id, _paths, _paths, auth.uid(), CASE WHEN cardinality(_paths) = 0 THEN 'completed' ELSE 'storage_pending' END)
  RETURNING id INTO _job;
  DELETE FROM public.documents WHERE customer_id = _c.id OR request_id = ANY(_req) OR booking_id = ANY(_bk);
  DELETE FROM public.umrah_participants WHERE customer_id = _c.id;
  DELETE FROM public.tasks WHERE customer_id = _c.id OR request_id = ANY(_req) OR booking_id = ANY(_bk);
  DELETE FROM public.work_record_permissions WHERE (entity = 'customers' AND record_id = _c.id) OR (entity = 'requests' AND record_id = ANY(_req)) OR (entity = 'bookings' AND record_id = ANY(_bk));
  DELETE FROM public.bookings WHERE id = ANY(_bk);
  DELETE FROM public.requests WHERE id = ANY(_req);
  DELETE FROM public.customers WHERE id = _c.id;
  UPDATE public.deletion_jobs SET completed_at = now() WHERE id = _job AND status = 'completed';
  INSERT INTO public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  VALUES (_c.office_id, auth.uid(), 'customers', _c.id, 'purged', 'حذف شامل: ' || cardinality(_req) || ' طلب، ' || cardinality(_bk) || ' حجز، ' || cardinality(_paths) || ' ملف');
  RETURN _job;
END $$;

CREATE OR REPLACE FUNCTION public.begin_document_deletion(_document uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.documents; _paths text[]; _job uuid;
BEGIN
  BEGIN
    SELECT * INTO _d FROM public.documents WHERE id = _document FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'الوثيقة قيد الحذف الآن.' USING ERRCODE = '55P03'; END;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'الوثيقة غير موجودة.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.work_allowed(_d.office_id, 'documents', _d.id, 'delete') THEN RAISE EXCEPTION 'لا تملك إذن حذف هذه الوثيقة.' USING ERRCODE = '42501'; END IF;
  _paths := CASE WHEN EXISTS (SELECT 1 FROM public.documents WHERE storage_path = _d.storage_path AND id <> _d.id) THEN '{}'::text[] ELSE ARRAY[_d.storage_path] END;
  INSERT INTO public.deletion_jobs(office_id, kind, target_id, paths, remaining, created_by, status, completed_at)
  VALUES (_d.office_id, 'document', _d.id, _paths, _paths, auth.uid(), CASE WHEN cardinality(_paths) = 0 THEN 'completed' ELSE 'storage_pending' END, CASE WHEN cardinality(_paths) = 0 THEN now() END)
  RETURNING id INTO _job;
  DELETE FROM public.work_record_permissions WHERE entity = 'documents' AND record_id = _d.id;
  DELETE FROM public.documents WHERE id = _d.id;
  RETURN _job;
END $$;
REVOKE EXECUTE ON FUNCTION public.begin_customer_deletion(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.begin_document_deletion(uuid) FROM anon;

-- 7. Office staff reports: employees see office-wide entries
CREATE OR REPLACE FUNCTION public.team_performance(_office uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _admin boolean; _result jsonb;
BEGIN
 IF _uid IS NULL OR NOT public.is_office_member(_office) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 _admin := true;
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
END $function$;

-- 8. Platform owner per-office views
CREATE OR REPLACE FUNCTION public.owner_offices_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', o.id, 'name', o.name, 'logo_path', o.logo_path, 'is_partner', o.is_partner, 'city', o.city, 'country', o.country,
      'phone', o.phone, 'whatsapp', o.whatsapp, 'email', o.email, 'created_at', o.created_at,
      'customers', (SELECT count(*) FROM public.customers WHERE office_id = o.id),
      'requests', (SELECT count(*) FROM public.requests WHERE office_id = o.id),
      'transactions', (SELECT count(*) FROM public.requests WHERE office_id = o.id AND service_details <> '{}'::jsonb),
      'bookings', (SELECT count(*) FROM public.bookings WHERE office_id = o.id),
      'admins', (SELECT count(*) FROM public.office_members WHERE office_id = o.id AND role = 'admin' AND status = 'active'),
      'employees', (SELECT count(*) FROM public.office_members WHERE office_id = o.id AND role = 'employee' AND status = 'active'),
      'last_activity_at', (SELECT max(created_at) FROM public.activity_log WHERE office_id = o.id)) x
    FROM public.offices o) t);
END $$;

CREATE OR REPLACE FUNCTION public.owner_office_detail(_office uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'office', (SELECT to_jsonb(o) FROM public.offices o WHERE o.id = _office),
    'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'status', m.status, 'joined_at', m.created_at, 'full_name', p.full_name, 'email', p.email)), '[]'::jsonb)
                FROM public.office_members m LEFT JOIN public.profiles p ON p.id = m.user_id WHERE m.office_id = _office),
    'customers', (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'passport_number'), '[]'::jsonb) FROM public.customers c WHERE c.office_id = _office),
    'requests', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.requests r WHERE r.office_id = _office),
    'bookings', (SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM public.bookings b WHERE b.office_id = _office),
    'services', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.services s WHERE s.office_id = _office OR s.office_id IS NULL),
    'partners', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM public.partner_offices p WHERE p.office_id = _office),
    'trips', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.umrah_trips t WHERE t.office_id = _office),
    'participants', (SELECT coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) FROM public.umrah_participants u WHERE u.office_id = _office),
    'activity', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM public.activity_log WHERE office_id = _office ORDER BY created_at DESC LIMIT 3000) a));
END $$;

CREATE OR REPLACE FUNCTION public.owner_set_office_partner(_office uuid, _is_partner boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.offices SET is_partner = _is_partner WHERE id = _office;
END $$;

-- 9. Office logo storage
CREATE POLICY "office logos select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'office-logos' AND (public.is_office_member(((storage.foldername(name))[1])::uuid) OR public.is_platform_owner()));
CREATE POLICY "office logos insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'office-logos' AND public.is_office_admin(((storage.foldername(name))[1])::uuid));
CREATE POLICY "office logos update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'office-logos' AND public.is_office_admin(((storage.foldername(name))[1])::uuid));
CREATE POLICY "office logos delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'office-logos' AND public.is_office_admin(((storage.foldername(name))[1])::uuid));

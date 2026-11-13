-- 1. Base service catalog seeded per office (new offices via trigger, existing offices backfilled).
CREATE OR REPLACE FUNCTION public.seed_office_services(_office uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.services(office_id, code, name, icon, sort_order, is_active)
  SELECT _office, b.code, b.name, 'sparkles', b.ord, true
  FROM (VALUES ('flight','تذاكر الطيران',10),('visa','تأشيرة',20),('umrah','عمرة',30),('visit_visa','زيارة',40),
               ('security_approval','موافقة أمنية',50),('airport_pickup','استقبال في المطار',60),('medical','خدمة طبية',70)) AS b(code,name,ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.services s WHERE s.office_id = _office AND s.code = b.code);
$$;
REVOKE ALL ON FUNCTION public.seed_office_services(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_new_office_services() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.seed_office_services(NEW.id); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.seed_new_office_services() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER offices_seed_services AFTER INSERT ON public.offices FOR EACH ROW EXECUTE FUNCTION public.seed_new_office_services();

-- Existing custom rows that are plainly a base service (exact name) and not yet used by any request get the base code.
WITH m(name, code) AS (VALUES ('تذكرة طيران','flight'),('تذاكر الطيران','flight'),('تأشيرة','visa'),('عمرة','umrah'),('زيارة','visit_visa'),
  ('موافقة أمنية','security_approval'),('استقبال في المطار','airport_pickup'),('خدمة طبية','medical')),
cand AS (
  SELECT DISTINCT ON (s.office_id, m.code) s.id, m.code
  FROM public.services s JOIN m ON btrim(s.name) = m.name
  WHERE s.code = 'custom' AND s.office_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.services x WHERE x.office_id = s.office_id AND x.code = m.code)
    AND NOT EXISTS (SELECT 1 FROM public.requests r WHERE r.service_id = s.id)
  ORDER BY s.office_id, m.code, s.created_at)
UPDATE public.services s SET code = cand.code FROM cand WHERE s.id = cand.id;
SELECT public.seed_office_services(id) FROM public.offices;
CREATE UNIQUE INDEX services_office_base_code_unique ON public.services(office_id, code) WHERE office_id IS NOT NULL AND code <> 'custom';

-- 2. Request and booking numbers count per office.
CREATE OR REPLACE FUNCTION public.assign_office_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME || ':' || NEW.office_id::text, 0));
  IF TG_TABLE_NAME = 'requests' THEN
    SELECT coalesce(max(number), 0) + 1 INTO NEW.number FROM public.requests WHERE office_id = NEW.office_id;
  ELSE
    SELECT coalesce(max(number), 0) + 1 INTO NEW.number FROM public.bookings WHERE office_id = NEW.office_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_office_number() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER requests_office_number BEFORE INSERT ON public.requests FOR EACH ROW EXECUTE FUNCTION public.assign_office_number();
CREATE TRIGGER bookings_office_number BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.assign_office_number();
CREATE UNIQUE INDEX requests_office_number_unique ON public.requests(office_id, number);
CREATE UNIQUE INDEX bookings_office_number_unique ON public.bookings(office_id, number);

-- 3. Duplicate prevention.
CREATE UNIQUE INDEX customers_office_passport_unique ON public.customers(office_id, upper(btrim(passport_number)))
  WHERE passport_number IS NOT NULL AND btrim(passport_number) <> '';
CREATE UNIQUE INDEX bookings_open_ref_unique ON public.bookings(office_id, customer_id, coalesce(request_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(external_ref)))
  WHERE external_ref IS NOT NULL AND btrim(external_ref) <> '' AND status <> 'cancelled';

-- 4. Expiry dates.
ALTER TABLE public.umrah_participants ADD COLUMN visa_expiry date;
ALTER TABLE public.customers ADD COLUMN passport_expiry date;

-- 5. Document file types and confirmed uploads.
CREATE OR REPLACE FUNCTION public.document_file_allowed(_name text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT lower(substring(_name from '\.([A-Za-z0-9]+)$')) = ANY (ARRAY['pdf','jpg','jpeg','png','webp','gif','heic','heif','doc','docx','xls','xlsx','csv','txt','rtf','odt','ods']);
$$;
GRANT EXECUTE ON FUNCTION public.document_file_allowed(text) TO authenticated;

DROP POLICY "documents files insert" ON storage.objects;
CREATE POLICY "documents files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.is_office_member(((storage.foldername(name))[1])::uuid) AND public.document_file_allowed(name));

CREATE OR REPLACE FUNCTION public.check_document_refs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if split_part(new.storage_path, '/', 1) <> new.office_id::text then raise exception 'File path must start with the office id'; end if;
  if tg_op = 'INSERT' and not public.document_file_allowed(new.storage_path) then raise exception 'File type not allowed' using errcode = '22023'; end if;
  if new.customer_id is not null and not exists(select 1 from public.customers where id = new.customer_id and office_id = new.office_id) then raise exception 'Customer does not belong to this office'; end if;
  if new.request_id is not null and not exists(select 1 from public.requests where id = new.request_id and office_id = new.office_id) then raise exception 'Request does not belong to this office'; end if;
  if new.booking_id is not null and not exists(select 1 from public.bookings where id = new.booking_id and office_id = new.office_id) then raise exception 'Booking does not belong to this office'; end if;
  return new;
end $$;

-- Upload confirmation is not an audited business change.
CREATE OR REPLACE FUNCTION public.log_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r jsonb; before_row jsonb; after_row jsonb; act text; label text; previous_status text; current_status text; fields text[];
BEGIN
IF TG_OP = 'DELETE' THEN before_row := to_jsonb(OLD); r := before_row; act := 'deleted';
ELSIF TG_OP = 'INSERT' THEN after_row := to_jsonb(NEW); r := after_row; act := 'created';
ELSE before_row := to_jsonb(OLD); after_row := to_jsonb(NEW); r := after_row; act := 'updated'; previous_status := before_row->>'status'; current_status := after_row->>'status';
IF previous_status IS DISTINCT FROM current_status THEN act := CASE WHEN current_status IN ('completed','done') THEN 'completed' WHEN current_status = 'cancelled' THEN 'cancelled' WHEN previous_status IN ('completed','done') THEN 'reopened' ELSE 'status' END; END IF; END IF;
SELECT array_agg(key ORDER BY key) INTO fields FROM jsonb_object_keys(coalesce(before_row,'{}'::jsonb) || coalesce(after_row,'{}'::jsonb)) key WHERE (before_row->key) IS DISTINCT FROM (after_row->key);
IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'documents' AND coalesce(fields, ARRAY[]::text[]) <@ ARRAY['uploaded_at'] THEN RETURN NULL; END IF;
label := CASE TG_TABLE_NAME WHEN 'customers' THEN 'عميل' WHEN 'requests' THEN 'REQ-' || lpad(r->>'number',4,'0') WHEN 'bookings' THEN 'BK-' || lpad(r->>'number',4,'0') WHEN 'tasks' THEN 'مهمة' WHEN 'documents' THEN 'وثيقة' WHEN 'umrah_trips' THEN 'رحلة عمرة' WHEN 'umrah_participants' THEN 'معتمر' END;
IF EXISTS(SELECT 1 FROM public.offices WHERE id = (r->>'office_id')::uuid) THEN
INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary,old_values,new_values,result,actor_name,changed_fields) VALUES ((r->>'office_id')::uuid,auth.uid(),TG_TABLE_NAME,(r->>'id')::uuid,act,coalesce(label,TG_TABLE_NAME),CASE WHEN before_row IS NOT NULL THEN public.audit_safe_values(before_row) END,CASE WHEN after_row IS NOT NULL THEN public.audit_safe_values(after_row) END,'success',(SELECT full_name FROM public.profiles WHERE id=auth.uid()),fields); END IF; RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.documents ADD COLUMN uploaded_at timestamptz;
UPDATE public.documents d SET uploaded_at = d.created_at
  WHERE EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'documents' AND o.name = d.storage_path);

CREATE OR REPLACE FUNCTION public.confirm_document_upload(_document uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document FOR UPDATE;
  IF d.id IS NULL OR NOT public.is_office_member(d.office_id) OR d.uploaded_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF d.uploaded_at IS NOT NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'documents' AND o.name = d.storage_path) THEN RETURN false; END IF;
  UPDATE public.documents SET uploaded_at = now() WHERE id = _document;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_document_upload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_document_upload(uuid) TO authenticated;
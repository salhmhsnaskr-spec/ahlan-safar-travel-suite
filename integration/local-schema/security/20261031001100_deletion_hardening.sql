-- INDEPENDENT ONLY. Apply after 00700, optional 00800, 00900 and 01000.
-- Never apply to hosted production without separate review and approval.
BEGIN;
ALTER TABLE public.deletion_jobs DROP CONSTRAINT deletion_jobs_kind_check;
ALTER TABLE public.deletion_jobs ADD CONSTRAINT deletion_jobs_kind_check CHECK(kind IN ('customer','office','document'));
REVOKE DELETE ON public.documents FROM PUBLIC,anon,authenticated;
REVOKE UPDATE,DELETE,INSERT ON public.office_members FROM PUBLIC,anon,authenticated;
REVOKE UPDATE(role) ON public.office_members FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.deletion_frozen(_office uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _office IS NULL THEN RETURN false; END IF;
 IF NOT coalesce((public.is_office_member(_office) OR public.is_platform_owner() OR
   auth.role()='service_role' OR (session_user='postgres' AND current_setting('role')='none')),false) THEN
   RAISE EXCEPTION 'Forbidden office scope' USING ERRCODE='42501';
 END IF;
 -- Read only: policy evaluation must never lock an unrelated office.
 RETURN EXISTS(SELECT 1 FROM public.deletion_jobs WHERE office_id=_office AND status<>'completed');
END $$;
CREATE OR REPLACE FUNCTION public.guard_deletion_freeze() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o uuid;
BEGIN
 o := CASE WHEN TG_TABLE_NAME='offices' THEN coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id')::uuid
 ELSE coalesce(to_jsonb(NEW)->>'office_id',to_jsonb(OLD)->>'office_id')::uuid END;
 IF o IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF public.deletion_internal(o) THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 -- Locks serialize new linked writes against job creation, closing preflight races.
 PERFORM id FROM public.offices WHERE id=o FOR UPDATE NOWAIT;
 IF public.deletion_frozen(o) OR (TG_OP='DELETE' AND TG_TABLE_NAME IN ('customers','offices','documents')) THEN
 RAISE EXCEPTION 'Use permanent deletion; scope is frozen while cleanup is pending' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>'office_id') IS DISTINCT FROM (to_jsonb(NEW)->>'office_id') THEN
 RAISE EXCEPTION 'Office identity is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE FUNCTION public.require_customer_deletion_admin(_office uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_office_admin(_office) THEN RAISE EXCEPTION 'Active office admin required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_customer_deletion_admin(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.begin_permanent_deletion(_office uuid, _kind text, _target uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.deletion_jobs; e jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF _kind='office' THEN
 IF _target IS DISTINCT FROM _office OR NOT (public.is_office_admin(_office) OR public.is_platform_owner()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 ELSIF _kind='customer' THEN
 PERFORM public.require_customer_deletion_admin(_office);
 ELSE RAISE EXCEPTION 'Invalid kind'; END IF;
 PERFORM id FROM public.offices WHERE id=_office FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Office not found'; END IF;
 SELECT * INTO j FROM public.deletion_jobs WHERE office_id=_office AND status <> 'completed';
 IF FOUND THEN IF j.kind=_kind AND j.target_id=_target THEN RETURN j.id; END IF; RAISE EXCEPTION 'Another deletion is pending'; END IF;
 IF _kind='customer' AND NOT EXISTS(SELECT 1 FROM public.customers WHERE office_id=_office AND id=_target) THEN RAISE EXCEPTION 'Customer not found'; END IF;
 WITH r AS (SELECT id FROM public.requests WHERE office_id=_office AND (_kind='office' OR customer_id=_target)),
 b AS (SELECT id FROM public.bookings WHERE office_id=_office AND (_kind='office' OR customer_id=_target OR request_id IN (SELECT id FROM r))),
 t AS (SELECT id FROM public.tasks WHERE office_id=_office AND (_kind='office' OR customer_id=_target OR request_id IN (SELECT id FROM r) OR booking_id IN (SELECT id FROM b))),
 d AS (SELECT id FROM public.documents WHERE office_id=_office AND (_kind='office' OR customer_id=_target OR request_id IN (SELECT id FROM r) OR booking_id IN (SELECT id FROM b))),
 u AS (SELECT id FROM public.umrah_participants WHERE office_id=_office AND (_kind='office' OR customer_id=_target OR request_id IN (SELECT id FROM r)))
 SELECT jsonb_build_object('customers',CASE WHEN _kind='office' THEN (SELECT coalesce(jsonb_agg(id),'[]') FROM public.customers WHERE office_id=_office) ELSE jsonb_build_array(_target) END,
 'requests',(SELECT coalesce(jsonb_agg(id),'[]') FROM r),'bookings',(SELECT coalesce(jsonb_agg(id),'[]') FROM b),
 'tasks',(SELECT coalesce(jsonb_agg(id),'[]') FROM t),'documents',(SELECT coalesce(jsonb_agg(id),'[]') FROM d),
 'umrah_participants',(SELECT coalesce(jsonb_agg(id),'[]') FROM u)) INTO e;
 -- Cascade is not a route around existing child DELETE permissions.
 IF _kind='customer' AND NOT public.is_office_admin(_office) AND (
 jsonb_array_length(e->'bookings')>0 OR jsonb_array_length(e->'tasks')>0 OR
 EXISTS(SELECT 1 FROM public.documents WHERE office_id=_office AND id::text IN (SELECT jsonb_array_elements_text(e->'documents')) AND uploaded_by IS DISTINCT FROM auth.uid()) OR
 EXISTS(SELECT 1 FROM storage.objects o JOIN public.documents d ON d.storage_path=o.name WHERE d.office_id=_office AND d.id::text IN (SELECT jsonb_array_elements_text(e->'documents')) AND o.bucket_id='documents' AND o.owner IS DISTINCT FROM auth.uid())
 ) THEN RAISE EXCEPTION 'Cascade requires authority over protected dependents; ask office admin' USING ERRCODE='42501'; END IF;
 -- Refuse corrupted cross-office references BEFORE any irreversible file removal.
 IF EXISTS(SELECT 1 FROM public.requests WHERE office_id<>_office AND customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')))
 OR EXISTS(SELECT 1 FROM public.bookings WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests'))))
 OR EXISTS(SELECT 1 FROM public.tasks WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests')) OR booking_id::text IN (SELECT jsonb_array_elements_text(e->'bookings'))))
 OR EXISTS(SELECT 1 FROM public.documents WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests')) OR booking_id::text IN (SELECT jsonb_array_elements_text(e->'bookings'))))
 OR EXISTS(SELECT 1 FROM public.umrah_participants WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests')))) THEN
 RAISE EXCEPTION 'Cross-office reference corruption; no deletion started' USING ERRCODE='42501'; END IF;
 INSERT INTO public.deletion_jobs(office_id,kind,target_id,requested_by,entities) VALUES(_office,_kind,_target,auth.uid(),e) RETURNING * INTO j;
 RETURN j.id;
END $$;
CREATE OR REPLACE FUNCTION public.finish_deletion(_job uuid, _attempt integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.deletion_jobs; t text;
BEGIN
 SELECT * INTO j FROM public.deletion_jobs WHERE id=_job;
 IF j.status='completed' THEN RETURN; END IF;
 -- Office first, then job; fail fast rather than waiting on row-trigger inversions.
 PERFORM id FROM public.offices WHERE id=j.office_id FOR UPDATE NOWAIT;
 SELECT * INTO j FROM public.deletion_jobs WHERE id=_job FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
 IF j.status='completed' THEN RETURN; END IF;
 IF j.status <> 'running' OR j.attempts <> _attempt OR j.lease_until < now() THEN RAISE EXCEPTION 'Job not claimed or lease expired'; END IF;
 
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='documents' AND o.name IN (SELECT path FROM public.deletion_paths(_job))) THEN
 RAISE EXCEPTION 'Storage objects remain'; END IF;
 INSERT INTO public.deletion_scope VALUES(pg_backend_pid(),txid_current(),j.id);
 FOREACH t IN ARRAY ARRAY['documents','tasks','umrah_participants','bookings','requests','customers'] LOOP
 EXECUTE format('DELETE FROM public.%I WHERE office_id=$1 AND id::text IN (SELECT jsonb_array_elements_text($2))',t) USING j.office_id,j.entities->t;
 END LOOP;
 -- Delete generated AND historic audit events for this exact entity closure.
 DELETE FROM public.activity_log a WHERE a.office_id=j.office_id AND (j.kind='office' OR
 a.entity_id::text IN (SELECT jsonb_array_elements_text(j.entities->a.entity)));
 IF j.kind='office' THEN
 DELETE FROM public.umrah_trips WHERE office_id=j.office_id;
 DELETE FROM public.office_invitations WHERE office_id=j.office_id;
 DELETE FROM public.office_members WHERE office_id=j.office_id;
 DELETE FROM public.services WHERE office_id=j.office_id;
 DELETE FROM public.partner_offices WHERE office_id=j.office_id;
 DELETE FROM public.offices WHERE id=j.office_id;
 END IF;
 DELETE FROM public.deletion_scope WHERE backend=pg_backend_pid() AND transaction_id=txid_current();
 -- Retain only non-identifying receipt; no office, customer, file paths or user data.
 UPDATE public.deletion_jobs SET status='completed',office_id=NULL,target_id=NULL,requested_by=NULL,entities='{}',lease_until=NULL,last_error=NULL WHERE id=j.id;
END $$;
CREATE FUNCTION public.begin_document_deletion(_office uuid,_document uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d public.documents; j public.deletion_jobs;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_office_member(_office) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.offices WHERE id=_office FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Office not found'; END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=_office AND id=_document;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF NOT public.is_office_admin(_office) AND (d.uploaded_by IS DISTINCT FROM auth.uid() OR
 EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='documents' AND name=d.storage_path AND owner IS DISTINCT FROM auth.uid())) THEN
 RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.deletion_jobs WHERE office_id=_office AND status<>'completed';
 IF FOUND THEN
 IF j.kind='document' AND j.target_id=_document THEN RETURN j.id; END IF;
 RAISE EXCEPTION 'Another deletion is pending'; END IF;
 INSERT INTO public.deletion_jobs(office_id,kind,target_id,requested_by,entities)
 VALUES(_office,'document',_document,auth.uid(),jsonb_build_object('customers','[]'::jsonb,'requests','[]'::jsonb,
 'bookings','[]'::jsonb,'tasks','[]'::jsonb,'umrah_participants','[]'::jsonb,'documents',jsonb_build_array(_document))) RETURNING id INTO j.id;
 RETURN j.id;
END $$;
REVOKE ALL ON FUNCTION public.begin_document_deletion(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_document_deletion(uuid,uuid) TO authenticated;
CREATE FUNCTION public.set_member_role(_office uuid,_user uuid,_role public.app_role) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_office_admin(_office) OR _role IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.offices WHERE id=_office FOR UPDATE NOWAIT;
 UPDATE public.office_members SET role=_role WHERE office_id=_office AND user_id=_user AND status<>'removed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_member_role(uuid,uuid,public.app_role) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid,uuid,public.app_role) TO authenticated;
CREATE FUNCTION public.renew_deletion(_job uuid,_attempt integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.deletion_jobs SET lease_until=now()+interval '5 minutes'
 WHERE id=_job AND status='running' AND attempts=_attempt AND lease_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease lost' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.renew_deletion(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.renew_deletion(uuid,integer) TO service_role;
-- Existing last-admin guard also fails fast instead of waiting while holding a member row.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.guard_last_office_admin()'::regprocedure);
 definition:=replace(definition,'FOR UPDATE;','FOR UPDATE NOWAIT;');
 EXECUTE definition;
END $$;
-- Fail closed on unreviewed inherited/SET ROLE privileges. Do not mutate managed role memberships.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN
 (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','sandbox_exec'))) THEN
 RAISE EXCEPTION 'Client role memberships require independent review before API exposure'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','sandbox_exec') AND (rolsuper OR rolbypassrls OR rolcreaterole)) THEN
 RAISE EXCEPTION 'Elevated client role'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relkind IN ('r','p') AND c.relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','sandbox_exec'))) THEN
 RAISE EXCEPTION 'Client owned public table'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE r.rolname IN ('anon','authenticated','sandbox_exec') AND n.nspname='public' AND c.relkind IN ('r','p')
 AND has_table_privilege(r.oid,c.oid,'TRUNCATE,TRIGGER')) THEN RAISE EXCEPTION 'Unsafe effective client privileges'; END IF;
 -- 00700 already clears global AND schema PUBLIC/client defaults for both known creators.
 IF EXISTS(SELECT 1 FROM pg_default_acl WHERE defaclrole NOT IN
 (SELECT oid FROM pg_roles WHERE rolname IN ('postgres','supabase_admin')) AND defaclnamespace IN
 (0,(SELECT oid FROM pg_namespace WHERE nspname='public'))) THEN
 RAISE EXCEPTION 'Additional default-privilege creator requires review'; END IF;
END $$;
COMMIT;

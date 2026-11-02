-- STAGED INDEPENDENT ONLY. Requires 01200; never applied to hosted production.
BEGIN;
DROP INDEX public.deletion_one_active_office;
CREATE UNIQUE INDEX deletion_one_active_target ON public.deletion_jobs(office_id,kind,target_id) WHERE status<>'completed';
CREATE OR REPLACE FUNCTION public.deletion_pending(_office uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_jobs WHERE office_id=_office AND kind='office' AND status<>'completed')
$$;
CREATE OR REPLACE FUNCTION public.deletion_frozen(_office uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT coalesce(public.is_office_member(_office) OR public.is_platform_owner() OR auth.role()='service_role' OR (session_user='postgres' AND current_setting('role')='none'),false) THEN RAISE EXCEPTION 'Forbidden office scope' USING ERRCODE='42501'; END IF;
 RETURN public.deletion_pending(_office);
END $$;
CREATE FUNCTION public.deletion_record_pending(_office uuid,_entity text,_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_jobs j WHERE j.office_id=_office AND j.status<>'completed' AND (j.kind='office' OR coalesce(j.entities->_entity,'[]') @> jsonb_build_array(_id)))
$$;
CREATE FUNCTION public.deletion_path_pending(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_jobs j WHERE j.status<>'completed' AND ((j.kind='office' AND starts_with(_path,j.office_id::text||'/')) OR EXISTS(SELECT 1 FROM public.documents d WHERE d.storage_path=_path AND d.office_id=j.office_id AND j.entities->'documents' @> jsonb_build_array(d.id))))
$$;
REVOKE ALL ON FUNCTION public.deletion_record_pending(uuid,text,uuid),public.deletion_path_pending(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_record_pending(uuid,text,uuid),public.deletion_path_pending(text) TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['customers','requests','bookings','tasks','documents','umrah_participants'] LOOP
 EXECUTE format('DROP POLICY deletion_read_quarantine ON public.%I',t);
 EXECUTE format('CREATE POLICY deletion_read_quarantine ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.deletion_record_pending(office_id,%L,id))',t,t);
 END LOOP;
END $$;
DROP POLICY deletion_storage_read_quarantine ON storage.objects;
CREATE POLICY deletion_storage_read_quarantine ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'documents' OR NOT public.deletion_path_pending(name));
DROP POLICY deletion_storage_freeze ON storage.objects;
CREATE POLICY deletion_storage_freeze ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'documents' OR NOT public.deletion_path_pending(name));
DROP POLICY deletion_storage_update_freeze ON storage.objects;
CREATE POLICY deletion_storage_update_freeze ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'documents' OR NOT public.deletion_path_pending(name)) WITH CHECK(bucket_id<>'documents' OR NOT public.deletion_path_pending(name));
CREATE POLICY no_direct_storage_cleanup ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'documents');
CREATE OR REPLACE FUNCTION public.guard_deletion_freeze() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o uuid; row_data jsonb; old_data jsonb; customer uuid; candidate uuid;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 o:=CASE WHEN TG_TABLE_NAME='offices' THEN (row_data->>'id')::uuid ELSE (row_data->>'office_id')::uuid END;
 IF o IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF public.deletion_internal(o) THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 -- Shared office barrier allows unrelated customers to proceed simultaneously.
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(o::text,0)) THEN RAISE EXCEPTION 'Office lock busy' USING ERRCODE='55P03'; END IF;
 IF public.deletion_pending(o) OR public.deletion_record_pending(o,TG_TABLE_NAME,(row_data->>'id')::uuid) THEN RAISE EXCEPTION 'Deletion pending' USING ERRCODE='42501'; END IF;
 FOR customer IN SELECT DISTINCT v FROM (
 SELECT (row_data->>'customer_id')::uuid v UNION SELECT CASE WHEN TG_TABLE_NAME='customers' THEN (row_data->>'id')::uuid END
 UNION SELECT customer_id FROM public.requests WHERE id=(row_data->>'request_id')::uuid AND office_id=o
 UNION SELECT customer_id FROM public.bookings WHERE id=(row_data->>'booking_id')::uuid AND office_id=o
 UNION SELECT CASE WHEN TG_OP='UPDATE' THEN (to_jsonb(OLD)->>'customer_id')::uuid END
 UNION SELECT customer_id FROM public.requests WHERE TG_OP='UPDATE' AND id=(to_jsonb(OLD)->>'request_id')::uuid AND office_id=o
 UNION SELECT customer_id FROM public.bookings WHERE TG_OP='UPDATE' AND id=(to_jsonb(OLD)->>'booking_id')::uuid AND office_id=o) roots WHERE v IS NOT NULL ORDER BY v LOOP
 PERFORM id FROM public.customers WHERE id=customer AND office_id=o FOR UPDATE NOWAIT;
 IF public.deletion_record_pending(o,'customers',customer) THEN RAISE EXCEPTION 'Customer deletion pending' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF TG_OP='DELETE' AND TG_TABLE_NAME IN ('customers','offices','documents') THEN RAISE EXCEPTION 'Use durable deletion' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>'office_id') IS DISTINCT FROM (to_jsonb(NEW)->>'office_id') THEN RAISE EXCEPTION 'Immutable office' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.begin_permanent_deletion(_office uuid, _kind text, _target uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.deletion_jobs; e jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF _kind='office' THEN
 IF _target IS DISTINCT FROM _office OR NOT (public.is_office_admin(_office) OR public.is_platform_owner()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 ELSIF _kind='customer' THEN
 IF NOT coalesce(public.work_allowed(_office,'customers',_target,'delete'),false) THEN RAISE EXCEPTION 'Forbidden customer deletion' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'Invalid kind'; END IF;
 IF _kind='office' THEN
 PERFORM pg_advisory_xact_lock(hashtextextended(_office::text,0));
 PERFORM id FROM public.offices WHERE id=_office FOR UPDATE NOWAIT;
 ELSE
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_office::text,0));
 PERFORM id FROM public.customers WHERE office_id=_office AND id=_target FOR UPDATE NOWAIT; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Office not found'; END IF;
 SELECT * INTO j FROM public.deletion_jobs WHERE office_id=_office AND status <> 'completed' AND (kind='office' OR _kind='office' OR (kind=_kind AND target_id=_target) OR (kind='document' AND entities->'customers' @> jsonb_build_array(_target)));
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
 -- Authorized root deletion includes dependents regardless of uploader.
 -- Ambiguous customer links or paths shared outside the frozen closure are never guessed.
 IF _kind='customer' AND EXISTS(
 SELECT 1 FROM public.documents d LEFT JOIN public.requests r ON r.id=d.request_id LEFT JOIN public.bookings b ON b.id=d.booking_id
 WHERE d.id::text IN (SELECT jsonb_array_elements_text(e->'documents')) AND (
 (d.customer_id IS NOT NULL AND d.customer_id<>_target) OR (r.customer_id IS NOT NULL AND r.customer_id<>_target) OR (b.customer_id IS NOT NULL AND b.customer_id<>_target) OR
 EXISTS(SELECT 1 FROM public.documents other WHERE other.storage_path=d.storage_path AND other.id::text NOT IN (SELECT jsonb_array_elements_text(e->'documents'))))) THEN RAISE EXCEPTION 'Ambiguous document relationship; no deletion started' USING ERRCODE='42501'; END IF;
 IF _kind='customer' AND EXISTS(SELECT 1 FROM public.tasks t WHERE t.id::text IN (SELECT jsonb_array_elements_text(e->'tasks')) AND t.customer_id IS NOT NULL AND t.customer_id<>_target) THEN RAISE EXCEPTION 'Ambiguous task relationship'; END IF;
 -- Refuse corrupted cross-office references BEFORE any irreversible file removal.
 IF EXISTS(SELECT 1 FROM public.requests WHERE office_id<>_office AND customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')))
 OR EXISTS(SELECT 1 FROM public.bookings WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests'))))
 OR EXISTS(SELECT 1 FROM public.tasks WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests')) OR booking_id::text IN (SELECT jsonb_array_elements_text(e->'bookings'))))
 OR EXISTS(SELECT 1 FROM public.documents WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests')) OR booking_id::text IN (SELECT jsonb_array_elements_text(e->'bookings'))))
 OR EXISTS(SELECT 1 FROM public.umrah_participants WHERE office_id<>_office AND (customer_id::text IN (SELECT jsonb_array_elements_text(e->'customers')) OR request_id::text IN (SELECT jsonb_array_elements_text(e->'requests')))) THEN
 RAISE EXCEPTION 'Cross-office reference corruption; no deletion started' USING ERRCODE='42501'; END IF;
 INSERT INTO public.deletion_jobs(office_id,kind,target_id,requested_by,entities) VALUES(_office,_kind,_target,auth.uid(),e) RETURNING * INTO j;
 INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary) VALUES(_office,auth.uid(),CASE WHEN _kind='customer' THEN 'customers' ELSE 'offices' END,_target,'deletion_requested','durable deletion');
 RETURN j.id;
END $$;
CREATE OR REPLACE FUNCTION public.begin_document_deletion(_office uuid,_document uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d public.documents; j public.deletion_jobs; root uuid;
BEGIN
 IF NOT coalesce(public.work_allowed(_office,'documents',_document,'delete'),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_office::text,0));
 SELECT * INTO d FROM public.documents WHERE office_id=_office AND id=_document;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
 FOR root IN SELECT DISTINCT id FROM public.customers WHERE office_id=_office AND (id=d.customer_id OR id IN (SELECT customer_id FROM public.requests WHERE id=d.request_id AND office_id=_office) OR id IN (SELECT customer_id FROM public.bookings WHERE id=d.booking_id AND office_id=_office)) ORDER BY id LOOP
 PERFORM id FROM public.customers WHERE id=root FOR UPDATE NOWAIT;
 IF public.deletion_record_pending(_office,'customers',root) THEN RAISE EXCEPTION 'Customer deletion pending'; END IF;
 END LOOP;
 PERFORM id FROM public.documents WHERE office_id=_office AND id=_document FOR UPDATE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.documents WHERE storage_path=d.storage_path AND id<>d.id) THEN RAISE EXCEPTION 'Shared file; no deletion started'; END IF;
 SELECT * INTO j FROM public.deletion_jobs WHERE office_id=_office AND status<>'completed' AND (kind='office' OR entities->'documents' @> jsonb_build_array(_document));
 IF FOUND THEN IF j.kind='document' AND j.target_id=_document THEN RETURN j.id; END IF; RAISE EXCEPTION 'Overlapping deletion'; END IF;
 INSERT INTO public.deletion_jobs(office_id,kind,target_id,requested_by,entities) VALUES(_office,'document',_document,auth.uid(),jsonb_build_object('customers','[]'::jsonb,'requests','[]'::jsonb,'bookings','[]'::jsonb,'tasks','[]'::jsonb,'umrah_participants','[]'::jsonb,'documents',jsonb_build_array(_document))) RETURNING id INTO j.id;
 INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary) VALUES(_office,auth.uid(),'documents',_document,'deletion_requested','durable deletion');
 RETURN j.id;
END $$;
CREATE POLICY document_storage_write_scope ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'documents' OR EXISTS(SELECT 1 FROM public.documents d WHERE d.storage_path=name AND (public.is_office_admin(d.office_id) OR public.work_allowed(d.office_id,'documents',d.id,'edit'))));
CREATE POLICY document_storage_update_scope ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'documents') WITH CHECK(bucket_id<>'documents');
CREATE OR REPLACE FUNCTION public.finish_deletion(_job uuid, _attempt integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.deletion_jobs; t text;
BEGIN
 SELECT * INTO j FROM public.deletion_jobs WHERE id=_job;
 IF j.status='completed' THEN RETURN; END IF;
 -- Office first, then job; fail fast rather than waiting on row-trigger inversions.
 IF j.kind='office' THEN PERFORM pg_advisory_xact_lock(hashtextextended(j.office_id::text,0)); PERFORM id FROM public.offices WHERE id=j.office_id FOR UPDATE NOWAIT;
 ELSE
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(j.office_id::text,0));
 IF j.kind='customer' THEN PERFORM id FROM public.customers WHERE id=j.target_id AND office_id=j.office_id FOR UPDATE NOWAIT;
 ELSE PERFORM id FROM public.documents WHERE id=j.target_id AND office_id=j.office_id FOR UPDATE NOWAIT; END IF; END IF;
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
 DELETE FROM public.work_record_permissions p WHERE p.office_id=j.office_id AND (j.kind='office' OR p.record_id::text IN (SELECT jsonb_array_elements_text(j.entities->p.entity)));
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
CREATE OR REPLACE FUNCTION public.deletion_status(_office uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s text;
BEGIN
 IF NOT (public.is_office_member(_office) OR public.is_platform_owner()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT status INTO s FROM public.deletion_jobs WHERE office_id=_office AND kind='office' AND status<>'completed';
 RETURN jsonb_build_object('pending',s IS NOT NULL,'status',s);
END $$;
COMMIT;

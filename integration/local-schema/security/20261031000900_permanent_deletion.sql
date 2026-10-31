-- INDEPENDENT LOCAL INSTANCE ONLY. NOT APPLIED TO HOSTED CLOUD.
-- Apply after the six baseline files and 20261030000700_least_privilege.sql.
-- Compatible with the earlier RESTRICT overlay: explicit child-first deletion.
BEGIN;
CREATE TABLE public.deletion_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid, kind text NOT NULL CHECK(kind IN ('customer','office')),
 target_id uuid, requested_by uuid, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed')),
 attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 last_error text, entities jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deletion_jobs TO authenticated;
GRANT ALL ON public.deletion_jobs TO service_role;
ALTER TABLE public.deletion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY deletion_job_read ON public.deletion_jobs FOR SELECT TO authenticated USING
 (requested_by=auth.uid() OR public.is_office_admin(office_id) OR public.is_platform_owner());
CREATE UNIQUE INDEX deletion_one_active_office ON public.deletion_jobs(office_id) WHERE status <> 'completed';
CREATE TABLE public.deletion_scope (backend integer NOT NULL, transaction_id bigint NOT NULL, job_id uuid NOT NULL);
GRANT ALL ON public.deletion_scope TO service_role;
ALTER TABLE public.deletion_scope ENABLE ROW LEVEL SECURITY;
-- No client policies or grants: only a privileged finalizer can establish this transaction scope.
CREATE FUNCTION public.deletion_frozen(_office uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 BEGIN
 PERFORM id FROM public.offices WHERE id=_office FOR UPDATE;
 RETURN EXISTS(SELECT 1 FROM public.deletion_jobs WHERE office_id=_office AND status <> 'completed');
 END
$$;
CREATE FUNCTION public.deletion_internal(_office uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_scope s JOIN public.deletion_jobs j ON j.id=s.job_id
 WHERE s.backend=pg_backend_pid() AND s.transaction_id=txid_current() AND j.office_id=_office AND j.status='running')
$$;
CREATE FUNCTION public.guard_deletion_freeze() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o uuid;
BEGIN
 o := CASE WHEN TG_TABLE_NAME='offices' THEN coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id')::uuid
 ELSE coalesce(to_jsonb(NEW)->>'office_id',to_jsonb(OLD)->>'office_id')::uuid END;
 IF o IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF public.deletion_internal(o) THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 -- Locks serialize new linked writes against job creation, closing preflight races.
 PERFORM id FROM public.offices WHERE id=o FOR UPDATE;
 IF public.deletion_frozen(o) OR (TG_OP='DELETE' AND TG_TABLE_NAME IN ('customers','offices')) THEN
 RAISE EXCEPTION 'Use permanent deletion; scope is frozen while cleanup is pending' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>'office_id') IS DISTINCT FROM (to_jsonb(NEW)->>'office_id') THEN
 RAISE EXCEPTION 'Office identity is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['offices','customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips','office_members','office_invitations','services','partner_offices'] LOOP
 EXECUTE format('CREATE TRIGGER a_deletion_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_deletion_freeze()',t);
 END LOOP;
END $$;
-- Narrow transaction-only exceptions; no disabled triggers, RLS or session-variable bypass.
DO $$ DECLARE f text; definition text; BEGIN
 FOREACH f IN ARRAY ARRAY['guard_activity_immutable','guard_last_office_admin','guard_membership_identity'] LOOP
 definition := pg_get_functiondef(('public.'||f||'()')::regprocedure);
 definition := regexp_replace(definition, 'BEGIN', 'BEGIN IF TG_OP = ''DELETE'' AND public.deletion_internal(OLD.office_id) THEN RETURN OLD; END IF;', 'i');
 EXECUTE definition;
 END LOOP;
END $$;
CREATE POLICY deletion_storage_freeze ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (bucket_id <> 'documents' OR NOT public.deletion_frozen((storage.foldername(name))[1]::uuid));
CREATE POLICY deletion_storage_update_freeze ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (bucket_id <> 'documents' OR NOT public.deletion_frozen((storage.foldername(name))[1]::uuid))
 WITH CHECK (bucket_id <> 'documents' OR NOT public.deletion_frozen((storage.foldername(name))[1]::uuid));
CREATE FUNCTION public.begin_permanent_deletion(_office uuid, _kind text, _target uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.deletion_jobs; e jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF _kind='office' THEN
 IF _target IS DISTINCT FROM _office OR NOT (public.is_office_admin(_office) OR public.is_platform_owner()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 ELSIF _kind='customer' THEN
 IF NOT public.is_office_member(_office) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'Invalid kind'; END IF;
 PERFORM id FROM public.offices WHERE id=_office FOR UPDATE;
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
 INSERT INTO public.deletion_jobs(office_id,kind,target_id,requested_by,entities) VALUES(_office,_kind,_target,auth.uid(),e) RETURNING * INTO j;
 RETURN j.id;
END $$;
CREATE FUNCTION public.deletion_paths(_job uuid) RETURNS TABLE(path text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT d.storage_path FROM public.documents d JOIN public.deletion_jobs j ON j.id=_job AND d.office_id=j.office_id
 WHERE j.status <> 'completed' AND d.id::text IN (SELECT jsonb_array_elements_text(j.entities->'documents'))
 UNION SELECT o.name FROM storage.objects o JOIN public.deletion_jobs j ON j.id=_job
 WHERE j.status <> 'completed' AND j.kind='office' AND o.bucket_id='documents' AND starts_with(o.name,j.office_id::text||'/')
$$;
CREATE FUNCTION public.deletion_remaining(_job uuid) RETURNS TABLE(path text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT o.name FROM storage.objects o WHERE o.bucket_id='documents' AND o.name IN (SELECT path FROM public.deletion_paths(_job))
$$;
CREATE FUNCTION public.claim_deletion(_job uuid) RETURNS public.deletion_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.deletion_jobs;
BEGIN
 SELECT * INTO j FROM public.deletion_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
 IF j.status='completed' THEN RETURN j; END IF;
 IF j.lease_until > now() OR j.retry_at > now() THEN RAISE EXCEPTION 'Job busy or awaiting retry'; END IF;
 UPDATE public.deletion_jobs SET status='running',attempts=attempts+1,lease_until=now()+interval '5 minutes' WHERE id=_job RETURNING * INTO j;
 RETURN j;
END $$;
CREATE FUNCTION public.fail_deletion(_job uuid, _attempt integer) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE public.deletion_jobs SET status='pending',lease_until=NULL,last_error='Storage or database cleanup unconfirmed',
 retry_at=now()+make_interval(secs=>least(300, power(2,least(attempts,8))::integer)) WHERE id=_job AND status <> 'completed' AND attempts=_attempt
$$;
CREATE FUNCTION public.finish_deletion(_job uuid, _attempt integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.deletion_jobs; t text;
BEGIN
 SELECT * INTO j FROM public.deletion_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
 IF j.status='completed' THEN RETURN; END IF;
 IF j.status <> 'running' OR j.attempts <> _attempt OR j.lease_until < now() THEN RAISE EXCEPTION 'Job not claimed or lease expired'; END IF;
 PERFORM id FROM public.offices WHERE id=j.office_id FOR UPDATE;
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
REVOKE ALL ON FUNCTION public.begin_permanent_deletion(uuid,text,uuid),public.deletion_frozen(uuid),public.deletion_internal(uuid),public.guard_deletion_freeze(),public.deletion_paths(uuid),public.deletion_remaining(uuid),public.claim_deletion(uuid),public.fail_deletion(uuid,integer),public.finish_deletion(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_permanent_deletion(uuid,text,uuid),public.deletion_frozen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_paths(uuid),public.deletion_remaining(uuid),public.claim_deletion(uuid),public.fail_deletion(uuid,integer),public.finish_deletion(uuid,integer) TO service_role;
COMMIT;

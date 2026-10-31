-- INDEPENDENT LOCAL ONLY. Apply after permanent_deletion; never to hosted production.
BEGIN;
CREATE FUNCTION public.deletion_pending(_office uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_jobs WHERE office_id=_office AND status<>'completed')
$$;
REVOKE ALL ON FUNCTION public.deletion_pending(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_pending(uuid) TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['offices','customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips','services','partner_offices','activity_log'] LOOP
 EXECUTE format('CREATE POLICY deletion_read_quarantine ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.deletion_pending(%I))',t,CASE WHEN t='offices' THEN 'id' ELSE 'office_id' END);
 END LOOP;
END $$;
CREATE POLICY deletion_storage_read_quarantine ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'documents' OR NOT public.deletion_pending((storage.foldername(name))[1]::uuid));
CREATE FUNCTION public.deletion_status(_office uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_office_member(_office) OR public.is_platform_owner()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT status INTO s FROM public.deletion_jobs WHERE office_id=_office AND status<>'completed';
 RETURN jsonb_build_object('pending',s IS NOT NULL,'status',s);
END $$;
REVOKE ALL ON FUNCTION public.deletion_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_status(uuid) TO authenticated;
CREATE FUNCTION public.owner_deletion_offices() RETURNS TABLE(id uuid,name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.id,o.name FROM public.offices o ORDER BY o.created_at;
END $$;
REVOKE ALL ON FUNCTION public.owner_deletion_offices() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_deletion_offices() TO authenticated;
-- SECURITY DEFINER reports also need quarantine: RLS alone cannot hide their reads.
DO $$ DECLARE f text; definition text; BEGIN
 FOREACH f IN ARRAY ARRAY['team_performance','team_last_activity'] LOOP
 definition:=pg_get_functiondef(('public.'||f||'(uuid)')::regprocedure);
 IF strpos(definition,'Office deletion pending')=0 THEN
 definition:=regexp_replace(definition,'BEGIN','BEGIN IF public.deletion_pending(_office) THEN RAISE EXCEPTION ''Office deletion pending'' USING ERRCODE=''42501''; END IF;','i');
 EXECUTE definition;
 END IF;
 END LOOP;
END $$;
-- Owner statistics must not expose office data quarantined by a privileged RPC.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.platform_stats()'::regprocedure);
 definition:=regexp_replace(definition,'BEGIN','BEGIN IF EXISTS(SELECT 1 FROM public.deletion_jobs WHERE status<>''completed'') THEN RAISE EXCEPTION ''Office deletion pending'' USING ERRCODE=''42501''; END IF;','i');
 EXECUTE definition;
END $$;
COMMIT;
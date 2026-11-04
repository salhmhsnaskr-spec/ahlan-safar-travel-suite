CREATE OR REPLACE FUNCTION public.work_allowed(_office uuid, _entity text, _id uuid, _op text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _record_office uuid; _owner uuid;
BEGIN
  IF auth.uid() IS NULL OR _office IS NULL OR _id IS NULL OR _entity IS NULL OR _op IS NULL
     OR _entity NOT IN ('customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips')
     OR _op NOT IN ('edit','delete') THEN RETURN false; END IF;
  EXECUTE format('SELECT office_id FROM public.%I WHERE id = $1', _entity) INTO _record_office USING _id;
  IF _record_office IS DISTINCT FROM _office THEN RETURN false; END IF;
  IF NOT public.is_office_member(_office) THEN RETURN false; END IF;
  IF public.is_office_admin(_office) THEN RETURN true; END IF;
  _owner := public.work_owner(_entity, _id);
  RETURN coalesce(_owner = auth.uid(), false) OR EXISTS (
    SELECT 1 FROM public.work_record_permissions p
    WHERE p.office_id = _office AND p.entity = _entity AND p.record_id = _id
      AND p.operation = _op AND p.grantee_id = auth.uid()
      AND p.owner_id IS NOT DISTINCT FROM _owner
  );
END $function$;
REVOKE ALL ON FUNCTION public.work_allowed(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_allowed(uuid,text,uuid,text) TO authenticated, service_role;
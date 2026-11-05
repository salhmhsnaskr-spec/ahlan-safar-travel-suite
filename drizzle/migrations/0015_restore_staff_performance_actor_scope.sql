CREATE OR REPLACE FUNCTION public.team_performance(_office uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.team_performance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_performance(uuid) TO authenticated;
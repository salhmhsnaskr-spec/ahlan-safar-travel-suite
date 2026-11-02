-- STAGED INDEPENDENT OVERLAY ONLY. Not applied to Cloud or a real test service.
-- Requires the immutable reference plus security overlays 00700–01100 in a fresh isolated database.
BEGIN;
CREATE TABLE public.work_record_permissions (
 office_id uuid NOT NULL, entity text NOT NULL CHECK(entity IN ('customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips')),
 record_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('edit','delete')),
 grantee_id uuid NOT NULL, granted_by uuid NOT NULL, owner_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(office_id,entity,record_id,operation,grantee_id)
);
GRANT SELECT ON public.work_record_permissions TO authenticated;
GRANT ALL ON public.work_record_permissions TO service_role;
ALTER TABLE public.work_record_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY office_permission_read ON public.work_record_permissions FOR SELECT TO authenticated USING(public.is_office_member(office_id));
CREATE FUNCTION public.work_owner(_office uuid,_entity text,_record uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_id uuid;
BEGIN
 CASE _entity
 WHEN 'customers','requests','tasks' THEN EXECUTE format('SELECT assigned_to FROM public.%I WHERE office_id=$1 AND id=$2',_entity) INTO owner_id USING _office,_record;
 WHEN 'bookings' THEN SELECT assigned_employee_id INTO owner_id FROM public.bookings WHERE office_id=_office AND id=_record;
 WHEN 'documents' THEN
 SELECT CASE WHEN d.customer_id IS NULL AND d.request_id IS NULL AND d.booking_id IS NULL THEN d.uploaded_by
 ELSE coalesce(b.assigned_employee_id,r.assigned_to,c.assigned_to) END INTO owner_id
 FROM public.documents d LEFT JOIN public.bookings b ON b.id=d.booking_id AND b.office_id=d.office_id
 LEFT JOIN public.requests r ON r.id=d.request_id AND r.office_id=d.office_id
 LEFT JOIN public.customers c ON c.id=coalesce(d.customer_id,r.customer_id,b.customer_id) AND c.office_id=d.office_id
 WHERE d.office_id=_office AND d.id=_record;
 WHEN 'umrah_participants' THEN SELECT c.assigned_to INTO owner_id FROM public.umrah_participants p JOIN public.customers c ON c.id=p.customer_id AND c.office_id=p.office_id WHERE p.office_id=_office AND p.id=_record;
 WHEN 'umrah_trips' THEN RETURN NULL;
 ELSE RAISE EXCEPTION 'Invalid work entity'; END CASE;
 RETURN owner_id;
END $$;
CREATE FUNCTION public.work_allowed(_office uuid,_entity text,_record uuid,_operation text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_id uuid; present boolean;
BEGIN
 IF _operation NOT IN ('edit','delete') OR _entity NOT IN ('customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips') OR NOT public.is_office_member(_office) THEN RETURN false; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE office_id=$1 AND id=$2)',_entity) INTO present USING _office,_record;
 IF NOT present THEN RETURN false; END IF;
 owner_id:=public.work_owner(_office,_entity,_record);
 RETURN public.is_office_admin(_office) OR owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.work_record_permissions p WHERE p.office_id=_office AND p.entity=_entity AND p.record_id=_record AND p.operation=_operation AND p.grantee_id=auth.uid() AND p.owner_id IS NOT DISTINCT FROM owner_id);
END $$;
CREATE FUNCTION public.set_work_permission(_office uuid,_entity text,_record uuid,_grantee uuid,_operation text,_allow boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_id uuid;
BEGIN
 IF _entity NOT IN ('customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips') OR _operation NOT IN ('edit','delete') OR _allow IS NULL THEN RAISE EXCEPTION 'Invalid permission'; END IF;
 IF NOT public.is_office_member(_office) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT id FROM public.%I WHERE office_id=$1 AND id=$2 FOR UPDATE NOWAIT',_entity) USING _office,_record;
 IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
 owner_id:=public.work_owner(_office,_entity,_record);
 IF NOT public.is_office_admin(_office) AND owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.office_members WHERE office_id=_office AND user_id=_grantee AND status='active') THEN RAISE EXCEPTION 'Inactive grantee'; END IF;
 IF _allow THEN INSERT INTO public.work_record_permissions(office_id,entity,record_id,operation,grantee_id,granted_by,owner_id)
 VALUES(_office,_entity,_record,_operation,_grantee,auth.uid(),owner_id)
 ON CONFLICT(office_id,entity,record_id,operation,grantee_id) DO UPDATE SET granted_by=excluded.granted_by,owner_id=excluded.owner_id,created_at=now();
 ELSE DELETE FROM public.work_record_permissions WHERE office_id=_office AND entity=_entity AND record_id=_record AND operation=_operation AND grantee_id=_grantee; END IF;
 INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary) VALUES(_office,auth.uid(),_entity,_record,CASE WHEN _allow THEN 'permission_granted' ELSE 'permission_revoked' END,_operation);
END $$;
CREATE FUNCTION public.guard_work_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE field text:=CASE WHEN TG_TABLE_NAME='bookings' THEN 'assigned_employee_id' ELSE 'assigned_to' END; assignee uuid; before_id uuid;
BEGIN
 assignee:=(to_jsonb(NEW)->>field)::uuid;
 IF TG_OP='UPDATE' THEN
 before_id:=(to_jsonb(OLD)->>field)::uuid;
 IF NEW.office_id IS DISTINCT FROM OLD.office_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable record scope' USING ERRCODE='42501'; END IF;
 IF assignee IS DISTINCT FROM before_id THEN
 IF NOT public.is_office_admin(OLD.office_id) THEN RAISE EXCEPTION 'Admin reassignment only' USING ERRCODE='42501'; END IF;
 DELETE FROM public.work_record_permissions WHERE office_id=OLD.office_id AND entity=TG_TABLE_NAME AND record_id=OLD.id;
 INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary,old_values,new_values) VALUES(OLD.office_id,auth.uid(),TG_TABLE_NAME,OLD.id,'reassigned',TG_TABLE_NAME,jsonb_build_object(field,before_id),jsonb_build_object(field,assignee));
 END IF;
 ELSIF NOT public.is_office_admin(NEW.office_id) AND assignee IS NOT NULL AND assignee IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cannot assign colleagues on insert' USING ERRCODE='42501'; END IF;
 IF assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.office_members WHERE office_id=NEW.office_id AND user_id=assignee AND status='active') THEN RAISE EXCEPTION 'Inactive assignee'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['customers','requests','bookings','tasks','documents','umrah_participants','umrah_trips'] LOOP
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t AND permissive='PERMISSIVE' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t); END LOOP;
 EXECUTE format('CREATE POLICY work_read ON public.%I FOR SELECT TO authenticated USING(public.is_office_member(office_id))',t);
 IF t IN ('customers','requests','bookings','tasks') THEN
 EXECUTE format('CREATE POLICY work_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(public.is_office_member(office_id))',t);
 EXECUTE format('CREATE TRIGGER b_work_assignment BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_work_assignment()',t);
 ELSE
 EXECUTE format('CREATE POLICY work_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(public.is_office_admin(office_id))',t);
 END IF;
 EXECUTE format('CREATE POLICY work_update ON public.%I FOR UPDATE TO authenticated USING(public.work_allowed(office_id,%L,id,''edit'')) WITH CHECK(public.work_allowed(office_id,%L,id,''edit''))',t,t,t);
 IF t NOT IN ('customers','documents') THEN EXECUTE format('CREATE POLICY work_delete ON public.%I FOR DELETE TO authenticated USING(public.work_allowed(office_id,%L,id,''delete''))',t,t); END IF;
 END LOOP;
END $$;
-- Retain task status/notes allowlist but evaluate delegated current-work authority first.
CREATE OR REPLACE FUNCTION public.guard_task_employee_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.is_office_admin(OLD.office_id) THEN RETURN NEW; END IF;
 IF NOT public.work_allowed(OLD.office_id,'tasks',OLD.id,'edit') OR
 (to_jsonb(NEW)-ARRAY['status','notes','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','notes','updated_at']) THEN RAISE EXCEPTION 'Employees can only update authorized task status and notes' USING ERRCODE='42501'; END IF;
 NEW.updated_at:=OLD.updated_at; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.set_member_role(_office uuid,_user uuid,_role public.app_role) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous public.app_role;
BEGIN
 IF NOT public.is_office_admin(_office) OR _role IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.offices WHERE id=_office FOR UPDATE NOWAIT;
 SELECT role INTO previous FROM public.office_members WHERE office_id=_office AND user_id=_user AND status<>'removed' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
 UPDATE public.office_members SET role=_role WHERE office_id=_office AND user_id=_user;
 IF previous IS DISTINCT FROM _role THEN INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary,old_values,new_values) VALUES(_office,auth.uid(),'office_members',_user,'role_changed','office role',jsonb_build_object('role',previous),jsonb_build_object('role',_role)); END IF;
END $$;
REVOKE ALL ON FUNCTION public.work_owner(uuid,text,uuid),public.work_allowed(uuid,text,uuid,text),public.set_work_permission(uuid,text,uuid,uuid,text,boolean),public.guard_work_assignment() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.work_allowed(uuid,text,uuid,text),public.set_work_permission(uuid,text,uuid,uuid,text,boolean) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.office_members FROM PUBLIC,anon,authenticated;
REVOKE DELETE ON public.customers,public.documents FROM PUBLIC,anon,authenticated;
COMMIT;

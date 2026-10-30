ALTER TABLE public.customers ADD COLUMN updated_by uuid;
ALTER TABLE public.tasks ADD COLUMN updated_by uuid;
ALTER TABLE public.requests ADD COLUMN updated_by uuid, ADD COLUMN completed_by uuid, ADD COLUMN completed_at timestamptz, ADD COLUMN cancelled_by uuid, ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN updated_by uuid, ADD COLUMN completed_by uuid, ADD COLUMN completed_at timestamptz, ADD COLUMN cancelled_by uuid, ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.activity_log ADD COLUMN old_values jsonb, ADD COLUMN new_values jsonb, ADD COLUMN result text, ADD COLUMN actor_name text, ADD COLUMN changed_fields text[];

-- No backfill: absent historical evidence must never be assigned to current staff.
CREATE OR REPLACE FUNCTION public.stamp_work_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := NULL;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_by := auth.uid();
  END IF;
  IF TG_TABLE_NAME IN ('requests','bookings') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.completed_by := NULL; NEW.completed_at := NULL;
      NEW.cancelled_by := NULL; NEW.cancelled_at := NULL;
      IF NEW.status::text = 'completed' THEN
        NEW.completed_by := auth.uid(); NEW.completed_at := now();
      ELSIF NEW.status::text = 'cancelled' THEN
        NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now();
      END IF;
    ELSE
      NEW.completed_by := OLD.completed_by; NEW.completed_at := OLD.completed_at;
      NEW.cancelled_by := OLD.cancelled_by; NEW.cancelled_at := OLD.cancelled_at;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.completed_by := NULL; NEW.completed_at := NULL;
        NEW.cancelled_by := NULL; NEW.cancelled_at := NULL;
        IF NEW.status::text = 'completed' THEN
          NEW.completed_by := auth.uid(); NEW.completed_at := now();
        ELSIF NEW.status::text = 'cancelled' THEN
          NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now();
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_work_actor() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customers_provenance BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.stamp_work_actor();
CREATE TRIGGER requests_provenance BEFORE INSERT OR UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.stamp_work_actor();
CREATE TRIGGER bookings_provenance BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.stamp_work_actor();
-- Alphabetical trigger order: employee allowlist guard runs BEFORE this trusted stamp.
CREATE TRIGGER tasks_provenance BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.stamp_work_actor();

-- Explicit safe-value allowlist. Secrets, contact/passport data, raw free text,
-- document paths and service_details are omitted; changed field names remain visible.
CREATE OR REPLACE FUNCTION public.audit_safe_values(_row jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_object_agg(key,value), '{}'::jsonb) FROM jsonb_each(_row)
  WHERE key = ANY(ARRAY['id','office_id','number','status','role','user_id','source','priority',
    'assigned_to','assigned_employee_id','customer_id','request_id','booking_id','service_id',
    'referring_partner_id','trip_id','task_type','service_date','due_at','arrival_at',
    'planned_start','planned_end','planned_entry','planned_exit','actual_entry','actual_exit',
    'created_by','updated_by','completed_by','completed_at','cancelled_by','cancelled_at',
    'created_at','updated_at','status_changed_at','is_active','sort_order','size_bytes','mime_type']);
$$;
REVOKE ALL ON FUNCTION public.audit_safe_values(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r jsonb; before_row jsonb; after_row jsonb; act text; label text; previous_status text; current_status text; fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN before_row := to_jsonb(OLD); r := before_row; act := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN after_row := to_jsonb(NEW); r := after_row; act := 'created';
  ELSE
    before_row := to_jsonb(OLD); after_row := to_jsonb(NEW); r := after_row; act := 'updated';
    previous_status := before_row->>'status'; current_status := after_row->>'status';
    IF previous_status IS DISTINCT FROM current_status THEN
      act := CASE WHEN current_status IN ('completed','done') THEN 'completed'
        WHEN current_status = 'cancelled' THEN 'cancelled'
        WHEN previous_status IN ('completed','done') THEN 'reopened' ELSE 'status' END;
    END IF;
  END IF;
  SELECT array_agg(key ORDER BY key) INTO fields FROM jsonb_object_keys(coalesce(before_row,'{}'::jsonb) || coalesce(after_row,'{}'::jsonb)) key
    WHERE (before_row->key) IS DISTINCT FROM (after_row->key);
  label := CASE TG_TABLE_NAME
    WHEN 'customers' THEN 'عميل'
    WHEN 'requests' THEN 'REQ-' || lpad(r->>'number',4,'0')
    WHEN 'bookings' THEN 'BK-' || lpad(r->>'number',4,'0')
    WHEN 'tasks' THEN 'مهمة'
    WHEN 'documents' THEN 'وثيقة'
    WHEN 'umrah_trips' THEN 'رحلة عمرة'
    WHEN 'umrah_participants' THEN 'معتمر' END;
  IF EXISTS(SELECT 1 FROM public.offices WHERE id = (r->>'office_id')::uuid) THEN
    INSERT INTO public.activity_log(office_id,actor_id,entity,entity_id,action,summary,old_values,new_values,result,actor_name,changed_fields)
    VALUES ((r->>'office_id')::uuid,auth.uid(),TG_TABLE_NAME,(r->>'id')::uuid,act,coalesce(label,TG_TABLE_NAME),
      CASE WHEN before_row IS NOT NULL THEN public.audit_safe_values(before_row) END,
      CASE WHEN after_row IS NOT NULL THEN public.audit_safe_values(after_row) END,'success',
      (SELECT full_name FROM public.profiles WHERE id=auth.uid()),fields);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_activity_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Activity history is immutable' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.guard_activity_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER activity_immutable BEFORE UPDATE OR DELETE ON public.activity_log FOR EACH ROW EXECUTE FUNCTION public.guard_activity_immutable();
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.activity_log FROM anon,authenticated;
GRANT SELECT ON public.activity_log TO authenticated;

-- Manual invitation/status RPC entries are trusted but never supplied by the browser.
CREATE OR REPLACE FUNCTION public.stamp_activity_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.actor_id := auth.uid();
  NEW.actor_name := (SELECT full_name FROM public.profiles WHERE id=auth.uid());
  NEW.result := 'success'; NEW.created_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_activity_result() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER activity_stamp BEFORE INSERT ON public.activity_log FOR EACH ROW EXECUTE FUNCTION public.stamp_activity_result();

CREATE TRIGGER umrah_trips_activity AFTER INSERT OR UPDATE OR DELETE ON public.umrah_trips FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER umrah_participants_activity AFTER INSERT OR UPDATE OR DELETE ON public.umrah_participants FOR EACH ROW EXECUTE FUNCTION public.log_activity();
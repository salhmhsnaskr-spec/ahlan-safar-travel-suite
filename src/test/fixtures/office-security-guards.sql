CREATE OR REPLACE FUNCTION public.guard_task_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF public.is_office_admin(OLD.office_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'notes', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'notes', 'updated_at']) THEN
    RAISE EXCEPTION 'Employees can only update task status and notes' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := OLD.updated_at;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_last_office_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  remaining_admin uuid;
BEGIN
  IF OLD.role = 'admin' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.role = 'admin' AND NEW.office_id = OLD.office_id THEN
        RETURN NEW;
      END IF;
    END IF;
    PERFORM id FROM public.offices WHERE id = OLD.office_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Office not found' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO remaining_admin
    FROM public.office_members
    WHERE office_id = OLD.office_id AND role = 'admin' AND id <> OLD.id
    ORDER BY id LIMIT 1 FOR UPDATE;
    IF remaining_admin IS NULL THEN
      RAISE EXCEPTION 'لا يمكن إزالة أو تخفيض صلاحية آخر مدير للمكتب. أضف مديرًا آخر أولًا.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_last_office_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_task_employee_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER office_members_last_admin_guard
BEFORE UPDATE OR DELETE ON public.office_members
FOR EACH ROW EXECUTE FUNCTION public.guard_last_office_admin();
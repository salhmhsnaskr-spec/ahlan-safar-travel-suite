-- Copy of the live last-active-administrator guard (status aware).
CREATE OR REPLACE FUNCTION public.guard_last_office_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE remaining_admin uuid;
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'active' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.role = 'admin' AND NEW.status = 'active' AND NEW.office_id = OLD.office_id THEN RETURN NEW; END IF;
    END IF;
    PERFORM id FROM public.offices WHERE id = OLD.office_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Office not found' USING ERRCODE = '42501'; END IF;
    SELECT id INTO remaining_admin FROM public.office_members
    WHERE office_id = OLD.office_id AND role = 'admin' AND status = 'active' AND id <> OLD.id
    ORDER BY id LIMIT 1 FOR UPDATE;
    IF remaining_admin IS NULL THEN
      RAISE EXCEPTION 'لا يمكن إزالة أو إيقاف أو تخفيض صلاحية آخر مدير نشط للمكتب. أضف مديرًا آخر أولًا.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER office_members_last_admin_guard BEFORE UPDATE OR DELETE ON public.office_members
FOR EACH ROW EXECUTE FUNCTION public.guard_last_office_admin();

CREATE OR REPLACE FUNCTION public.work_owner(_entity text, _id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE _owner uuid; _d public.documents; _c public.customers; _r public.requests; _b public.bookings;
BEGIN
 IF _entity = 'customers' THEN SELECT assigned_to INTO _owner FROM public.customers WHERE id=_id;
 ELSIF _entity = 'requests' THEN SELECT assigned_to INTO _owner FROM public.requests WHERE id=_id;
 ELSIF _entity = 'bookings' THEN SELECT assigned_employee_id INTO _owner FROM public.bookings WHERE id=_id;
 ELSIF _entity = 'tasks' THEN SELECT assigned_to INTO _owner FROM public.tasks WHERE id=_id;
 ELSIF _entity = 'umrah_trips' THEN SELECT created_by INTO _owner FROM public.umrah_trips WHERE id=_id;
 ELSIF _entity = 'umrah_participants' THEN
   SELECT c.assigned_to INTO _owner FROM public.umrah_participants p JOIN public.customers c ON c.id=p.customer_id AND c.office_id=p.office_id WHERE p.id=_id;
 ELSIF _entity = 'documents' THEN
   SELECT * INTO _d FROM public.documents WHERE id=_id;
   IF _d.id IS NULL THEN RETURN NULL; END IF;
   IF _d.booking_id IS NOT NULL THEN
     SELECT * INTO _b FROM public.bookings WHERE id=_d.booking_id AND office_id=_d.office_id;
     IF _b.id IS NULL THEN RETURN NULL; END IF;
   END IF;
   IF coalesce(_d.request_id,_b.request_id) IS NOT NULL THEN
     SELECT * INTO _r FROM public.requests WHERE id=coalesce(_d.request_id,_b.request_id) AND office_id=_d.office_id;
     IF _r.id IS NULL THEN RETURN NULL; END IF;
   END IF;
   IF _d.booking_id IS NULL AND _d.request_id IS NULL AND _d.customer_id IS NULL THEN RETURN _d.uploaded_by; END IF;
   SELECT * INTO _c FROM public.customers WHERE id=coalesce(_d.customer_id,_r.customer_id,_b.customer_id) AND office_id=_d.office_id;
   IF _c.id IS NULL OR (_r.id IS NOT NULL AND _r.customer_id IS DISTINCT FROM _c.id)
      OR (_b.id IS NOT NULL AND _b.customer_id IS DISTINCT FROM _c.id)
      OR (_d.request_id IS NOT NULL AND _b.request_id IS NOT NULL AND _d.request_id IS DISTINCT FROM _b.request_id) THEN RETURN NULL; END IF;
   _owner := coalesce(_b.assigned_employee_id,_r.assigned_to,_c.assigned_to);
 END IF;
 RETURN _owner;
END $$;
REVOKE ALL ON FUNCTION public.work_owner(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_owner(text,uuid) TO authenticated, service_role;
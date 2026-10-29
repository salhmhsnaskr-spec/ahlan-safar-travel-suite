CREATE TYPE public.umrah_trip_status AS ENUM ('planned','preparing','in_progress','completed','cancelled');
CREATE TYPE public.umrah_pilgrim_status AS ENUM ('registered','preparing','arrived','departed','cancelled');

CREATE TABLE public.umrah_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id),
  name text NOT NULL,
  planned_start date,
  planned_end date,
  status public.umrah_trip_status NOT NULL DEFAULT 'planned',
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.umrah_trips TO authenticated;
GRANT ALL ON public.umrah_trips TO service_role;
ALTER TABLE public.umrah_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "umrah trips select" ON public.umrah_trips FOR SELECT TO authenticated USING (public.is_office_member(office_id));
CREATE POLICY "umrah trips insert" ON public.umrah_trips FOR INSERT TO authenticated WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "umrah trips update" ON public.umrah_trips FOR UPDATE TO authenticated USING (public.is_office_member(office_id)) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "umrah trips admin delete" ON public.umrah_trips FOR DELETE TO authenticated USING (public.is_office_admin(office_id));

CREATE TABLE public.umrah_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id),
  trip_id uuid NOT NULL REFERENCES public.umrah_trips(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  status public.umrah_pilgrim_status NOT NULL DEFAULT 'registered',
  planned_entry date,
  planned_exit date,
  actual_entry date,
  actual_exit date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT umrah_participant_unique UNIQUE (trip_id, customer_id),
  CONSTRAINT umrah_actual_order CHECK (actual_exit IS NULL OR actual_entry IS NULL OR actual_exit >= actual_entry),
  CONSTRAINT umrah_planned_order CHECK (planned_exit IS NULL OR planned_entry IS NULL OR planned_exit >= planned_entry),
  CONSTRAINT umrah_exit_needs_entry CHECK (actual_exit IS NULL OR actual_entry IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.umrah_participants TO authenticated;
GRANT ALL ON public.umrah_participants TO service_role;
ALTER TABLE public.umrah_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "umrah participants select" ON public.umrah_participants FOR SELECT TO authenticated USING (public.is_office_member(office_id));
CREATE POLICY "umrah participants insert" ON public.umrah_participants FOR INSERT TO authenticated WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "umrah participants update" ON public.umrah_participants FOR UPDATE TO authenticated USING (public.is_office_member(office_id)) WITH CHECK (public.is_office_member(office_id));
CREATE POLICY "umrah participants delete" ON public.umrah_participants FOR DELETE TO authenticated USING (public.is_office_member(office_id));

CREATE OR REPLACE FUNCTION public.check_umrah_participant_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if not exists(select 1 from public.umrah_trips where id = new.trip_id and office_id = new.office_id) then raise exception 'Trip does not belong to this office'; end if;
  if not exists(select 1 from public.customers where id = new.customer_id and office_id = new.office_id) then raise exception 'Customer does not belong to this office'; end if;
  if new.request_id is not null and not exists(select 1 from public.requests where id = new.request_id and office_id = new.office_id and customer_id = new.customer_id) then raise exception 'Request does not belong to this pilgrim'; end if;
  return new;
end $$;
CREATE TRIGGER umrah_participants_refs BEFORE INSERT OR UPDATE ON public.umrah_participants FOR EACH ROW EXECUTE FUNCTION public.check_umrah_participant_refs();
CREATE TRIGGER umrah_participants_updated BEFORE UPDATE ON public.umrah_participants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER umrah_trips_updated BEFORE UPDATE ON public.umrah_trips FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
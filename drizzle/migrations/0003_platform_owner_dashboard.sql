CREATE TABLE public.platform_owners (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_owners TO authenticated;
GRANT ALL ON public.platform_owners TO service_role;
ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read own row" ON public.platform_owners FOR SELECT TO authenticated USING (user_id = auth.uid());
COMMENT ON TABLE public.platform_owners IS 'Platform owner role. Granted server-side only; no insert/update/delete from the app.';

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists(select 1 from public.platform_owners where user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.platform_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare _r jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'offices', (select count(*) from offices),
    'active_offices_30d', (select count(*) from offices o where
        exists(select 1 from requests r where r.office_id = o.id and r.created_at > now() - interval '30 days')
        or exists(select 1 from bookings b where b.office_id = o.id and b.created_at > now() - interval '30 days')
        or exists(select 1 from customers c where c.office_id = o.id and c.created_at > now() - interval '30 days')),
    'customers', (select count(*) from customers),
    'requests_total', (select count(*) from requests),
    'requests_cancelled', (select count(*) from requests where status = 'cancelled'),
    'bookings_total', (select count(*) from bookings),
    'bookings_cancelled', (select count(*) from bookings where status = 'cancelled'),
    'monthly', (select coalesce(jsonb_agg(m order by m->>'month'), '[]'::jsonb) from (
        select jsonb_build_object(
          'month', to_char(g, 'YYYY-MM'),
          'offices', (select count(*) from offices where date_trunc('month', created_at) = g),
          'customers', (select count(*) from customers where date_trunc('month', created_at) = g),
          'requests', (select count(*) from requests where date_trunc('month', created_at) = g),
          'bookings', (select count(*) from bookings where date_trunc('month', created_at) = g)) m
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') g) s),
    'recent_offices', (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
        select jsonb_build_object('id', o.id, 'name', o.name, 'city', o.city, 'country', o.country, 'created_at', o.created_at,
          'members', (select count(*) from office_members m where m.office_id = o.id)) x
        from offices o order by o.created_at desc limit 10) t)
  ) into _r;
  return _r;
end $$;
REVOKE ALL ON FUNCTION public.platform_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;
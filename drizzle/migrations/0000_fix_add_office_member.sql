CREATE OR REPLACE FUNCTION public.add_office_member(_office uuid, _email text, _role app_role DEFAULT 'employee'::app_role)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _uid uuid; _mail text := lower(trim(_email));
begin
  if not public.is_office_admin(_office) then raise exception 'Only office admins can add members'; end if;
  select id into _uid from public.profiles where lower(email) = _mail limit 1;
  if _uid is null then
    select id into _uid from auth.users where lower(email) = _mail limit 1;
    if _uid is null then return 'not_found'; end if;
    insert into public.profiles(id, email) values (_uid, _mail) on conflict (id) do nothing;
  end if;
  if exists (select 1 from public.office_members where office_id = _office and user_id = _uid) then return 'exists'; end if;
  insert into public.office_members(office_id, user_id, role) values (_office, _uid, coalesce(_role, 'employee'));
  return 'ok';
end $function$;
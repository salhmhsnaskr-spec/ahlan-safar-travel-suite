ALTER TABLE public.office_invitations ADD COLUMN IF NOT EXISTS rotation_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.office_invitations ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz;

ALTER TABLE public.office_invitations DROP CONSTRAINT IF EXISTS office_invitations_send_status_check;
ALTER TABLE public.office_invitations ADD CONSTRAINT office_invitations_send_status_check
  CHECK (send_status = ANY (ARRAY['pending','manual_link','not_configured','send_attempted','provider_accepted','delivered','failed','sent']));
COMMENT ON COLUMN public.office_invitations.send_status IS 'pending=created; manual_link/not_configured=no email sent; send_attempted; provider_accepted=provider took the message (not proof of delivery); delivered=only from verified provider event; failed. Legacy value sent means provider_accepted.';

CREATE OR REPLACE FUNCTION public.resend_invitation(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare _inv public.office_invitations; _token text;
begin
  select * into _inv from public.office_invitations where id = _id for update;
  if _inv.id is null or not public.is_office_admin(_inv.office_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _inv.status <> 'pending' then return jsonb_build_object('error','not_pending'); end if;
  if greatest(_inv.created_at, coalesce(_inv.last_rotated_at, _inv.created_at), coalesce(_inv.last_sent_at, _inv.created_at)) > now() - interval '60 seconds' then
    return jsonb_build_object('error','too_soon'); end if;
  if _inv.rotation_count >= 5 then return jsonb_build_object('error','rotation_limit'); end if;
  _token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.office_invitations set token_hash = public._invite_hash(_token), expires_at = now() + interval '72 hours',
    failed_accepts = 0, send_status = 'pending', send_error = null,
    rotation_count = rotation_count + 1, last_rotated_at = now() where id = _id;
  insert into public.activity_log(office_id, actor_id, entity, entity_id, action, summary)
  values (_inv.office_id, auth.uid(), 'invitations', _id, 'resent', _inv.email);
  return jsonb_build_object('id', _id, 'token', _token);
end $function$;

CREATE OR REPLACE FUNCTION public.mark_invitation_sent(_id uuid, _status text, _error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _office uuid;
begin
  select office_id into _office from public.office_invitations where id = _id for update;
  if _office is null or not public.is_office_admin(_office) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if _status not in ('manual_link','not_configured','send_attempted','failed') then raise exception 'Invalid status' using errcode = '22023'; end if;
  update public.office_invitations set send_status = _status, send_error = left(_error, 300),
    send_attempts = send_attempts + case when _status in ('send_attempted','failed') then 1 else 0 end,
    last_sent_at = case when _status in ('send_attempted','failed') then now() else last_sent_at end
   where id = _id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.resend_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_invitation_sent(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invitation_sent(uuid, text, text) TO authenticated;
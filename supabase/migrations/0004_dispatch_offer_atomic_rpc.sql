-- Oferta + destinatarios na mesma transacao (evita oferta sem recipients se o segundo insert falhar).

create or replace function public.create_dispatch_offer_with_recipients(
  p_trip_id uuid,
  p_expires_at timestamptz,
  p_created_by uuid,
  p_driver_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_offer_id uuid;
  v_driver_id uuid;
begin
  if p_driver_ids is null or cardinality(p_driver_ids) = 0 then
    raise exception 'p_driver_ids required';
  end if;

  insert into dispatch_offers (trip_id, status, expires_at, created_by)
  values (p_trip_id, 'open', p_expires_at, p_created_by)
  returning id into v_offer_id;

  foreach v_driver_id in array p_driver_ids
  loop
    insert into dispatch_offer_recipients (offer_id, driver_id, notified_at)
    values (v_offer_id, v_driver_id, now());
  end loop;

  return v_offer_id;
end;
$$;

comment on function public.create_dispatch_offer_with_recipients(uuid, timestamptz, uuid, uuid[]) is
  'Cria oferta aberta e linhas em dispatch_offer_recipients em uma unica transacao.';

revoke all on function public.create_dispatch_offer_with_recipients(uuid, timestamptz, uuid, uuid[]) from public;
grant execute on function public.create_dispatch_offer_with_recipients(uuid, timestamptz, uuid, uuid[]) to service_role;

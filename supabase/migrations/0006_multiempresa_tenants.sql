-- Multiempresa (PRD): organizacao (tenant) e escopo em entidades operacionais.

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into tenants (id, name, slug)
values ('a0000000-0000-0000-0000-000000000001', 'Prime Vitória', 'default')
on conflict (id) do nothing;

-- Perfis: um tenant por utilizador operacional (MVP).
alter table profiles add column if not exists tenant_id uuid references tenants (id);
update profiles set tenant_id = 'a0000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table profiles alter column tenant_id set not null;
create index if not exists idx_profiles_tenant_id on profiles (tenant_id);

-- Clientes e frota
alter table clients add column if not exists tenant_id uuid references tenants (id);
update clients set tenant_id = 'a0000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table clients alter column tenant_id set not null;
create index if not exists idx_clients_tenant_id on clients (tenant_id);

alter table vehicles add column if not exists tenant_id uuid references tenants (id);
update vehicles set tenant_id = 'a0000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table vehicles alter column tenant_id set not null;
create index if not exists idx_vehicles_tenant_id on vehicles (tenant_id);

alter table drivers add column if not exists tenant_id uuid references tenants (id);
update drivers d
set tenant_id = p.tenant_id
from profiles p
where p.id = d.profile_id and d.tenant_id is null;
update drivers set tenant_id = 'a0000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table drivers alter column tenant_id set not null;
create index if not exists idx_drivers_tenant_id on drivers (tenant_id);

-- Viagens: espelha tenant do cliente.
alter table trips add column if not exists tenant_id uuid references tenants (id);
update trips t
set tenant_id = c.tenant_id
from clients c
where c.id = t.client_id and t.tenant_id is null;
update trips set tenant_id = 'a0000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table trips alter column tenant_id set not null;
create index if not exists idx_trips_tenant_id on trips (tenant_id);

-- Ofertas de despacho
alter table dispatch_offers add column if not exists tenant_id uuid references tenants (id);
update dispatch_offers o
set tenant_id = t.tenant_id
from trips t
where t.id = o.trip_id and o.tenant_id is null;
update dispatch_offers set tenant_id = 'a0000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table dispatch_offers alter column tenant_id set not null;
create index if not exists idx_dispatch_offers_tenant_id on dispatch_offers (tenant_id);

-- Mapeamentos ERP: unicidade por tenant
alter table erp_entity_mappings drop constraint if exists erp_entity_mappings_provider_entity_type_internal_id_key;

alter table erp_entity_mappings add column if not exists tenant_id uuid references tenants (id);
update erp_entity_mappings set tenant_id = 'a0000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table erp_entity_mappings alter column tenant_id set not null;

alter table erp_entity_mappings
  add constraint erp_entity_mappings_tenant_provider_entity_internal_key
  unique (tenant_id, provider, entity_type, internal_id);

create index if not exists idx_erp_entity_mappings_tenant_id on erp_entity_mappings (tenant_id);

-- RPC: preenche tenant_id da viagem ao criar oferta
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
  v_tenant_id uuid;
begin
  if p_driver_ids is null or cardinality(p_driver_ids) = 0 then
    raise exception 'p_driver_ids required';
  end if;

  select t.tenant_id into v_tenant_id from trips t where t.id = p_trip_id;
  if v_tenant_id is null then
    raise exception 'trip not found';
  end if;

  insert into dispatch_offers (trip_id, status, expires_at, created_by, tenant_id)
  values (p_trip_id, 'open', p_expires_at, p_created_by, v_tenant_id)
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
  'Cria oferta aberta e destinatarios; tenant_id copiado da viagem.';

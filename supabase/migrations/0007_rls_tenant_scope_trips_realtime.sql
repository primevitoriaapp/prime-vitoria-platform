-- RLS: escopo por tenant (multiempresa) + realtime em `trips` para clientes autenticados.

-- Trips: admin/operador só no próprio tenant
drop policy if exists trips_admin_operator on trips;
create policy trips_admin_operator on trips
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = trips.tenant_id
  )
);

-- Motorista: viagem atribuída e mesmo tenant
drop policy if exists trips_driver_assigned on trips;
create policy trips_driver_assigned on trips
for select
using (
  exists (
    select 1 from profiles p
    join drivers d on d.profile_id = p.id
    where p.id = auth.uid()
      and p.role = 'motorista'
      and d.id = trips.driver_id
      and p.tenant_id = trips.tenant_id
  )
);

-- Cliente: isolamento mínimo por tenant (escopo por cliente no app/API com service role)
drop policy if exists trips_client_own on trips;
create policy trips_client_own on trips
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'cliente'
      and p.tenant_id = trips.tenant_id
  )
);

-- Financeiro: leitura de viagens do tenant (consoles / relatórios via cliente Supabase)
drop policy if exists trips_financeiro_tenant_read on trips;
create policy trips_financeiro_tenant_read on trips
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'financeiro'
      and p.tenant_id = trips.tenant_id
  )
);

-- Clientes: admin/operador só no tenant
drop policy if exists clients_admin_full on clients;
create policy clients_admin_full on clients
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = clients.tenant_id
  )
);

drop policy if exists clients_self_read on clients;
create policy clients_self_read on clients
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'cliente'
      and p.tenant_id = clients.tenant_id
  )
);

-- Mapeamentos ERP por tenant
drop policy if exists erp_entity_mappings_admin_operador_write on erp_entity_mappings;
drop policy if exists erp_entity_mappings_financeiro_read on erp_entity_mappings;

create policy erp_entity_mappings_admin_operador_write on erp_entity_mappings
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = erp_entity_mappings.tenant_id
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = erp_entity_mappings.tenant_id
  )
);

create policy erp_entity_mappings_financeiro_read on erp_entity_mappings
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'financeiro'
      and p.tenant_id = erp_entity_mappings.tenant_id
  )
);

-- Realtime: alterações em corridas (filtro tenant_id no cliente)
alter table trips replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table public.trips;
  end if;
end
$$;

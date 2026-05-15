-- Localizações de motoristas: tenant denormalizado, RLS e Realtime.

alter table driver_locations add column if not exists tenant_id uuid references tenants (id);

update driver_locations dl
set tenant_id = d.tenant_id
from drivers d
where dl.driver_id = d.id and dl.tenant_id is null;

update driver_locations
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table driver_locations alter column tenant_id set not null;

create index if not exists idx_driver_locations_tenant_time on driver_locations (tenant_id, recorded_at desc);

alter table driver_locations enable row level security;

drop policy if exists driver_locations_select_tenant on driver_locations;
create policy driver_locations_select_tenant on driver_locations
for select using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = driver_locations.tenant_id
      and (
        p.role in ('admin', 'operador', 'financeiro')
        or (
          p.role = 'motorista'
          and exists (
            select 1 from drivers d
            where d.profile_id = p.id and d.id = driver_locations.driver_id
          )
        )
      )
  )
);

drop policy if exists driver_locations_insert_motorista on driver_locations;
create policy driver_locations_insert_motorista on driver_locations
for insert with check (
  exists (
    select 1 from profiles p
    join drivers d on d.profile_id = p.id
    where p.id = auth.uid()
      and p.role = 'motorista'
      and d.id = driver_locations.driver_id
      and d.tenant_id = driver_locations.tenant_id
  )
);

drop policy if exists driver_locations_insert_ops on driver_locations;
create policy driver_locations_insert_ops on driver_locations
for insert with check (
  exists (
    select 1 from profiles p
    join drivers d on d.tenant_id = p.tenant_id
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and d.id = driver_locations.driver_id
      and driver_locations.tenant_id = p.tenant_id
  )
);

alter table driver_locations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_locations'
  ) then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
end
$$;

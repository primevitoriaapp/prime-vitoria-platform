-- Vínculo opcional cliente corporativo -> perfil (escopo de viagens no RLS).

alter table profiles add column if not exists client_id uuid references clients (id);

create index if not exists idx_profiles_client_id on profiles (client_id)
  where client_id is not null;

-- Cliente só vê viagens do próprio cadastro corporativo (e do mesmo tenant).
drop policy if exists trips_client_own on trips;
create policy trips_client_own on trips
for select using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'cliente'
      and p.tenant_id = trips.tenant_id
      and p.client_id is not null
      and p.client_id = trips.client_id
  )
);

-- Reivindicação de atendimento por viagem (multiatendimento): no máximo um ativo por corrida.
-- RLS em notas operacionais para leitura via cliente autenticado (Realtime).
-- Publicação Realtime para refreshes colaborativos na agenda/despacho.

create table if not exists trip_operational_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  trip_id uuid not null references trips (id) on delete cascade,
  operator_profile_id uuid not null references profiles (id),
  claimed_at timestamptz not null default now(),
  released_at timestamptz
);

create unique index if not exists uq_trip_operational_claims_one_active
  on trip_operational_claims (trip_id)
  where released_at is null;

create index if not exists idx_trip_operational_claims_tenant_trip
  on trip_operational_claims (tenant_id, trip_id, claimed_at desc);

alter table trip_operational_claims enable row level security;

-- Notas: leitura para equipa operacional (interno), escrita só admin/operador
drop policy if exists trip_operator_notes_admin_operador_read on trip_operator_notes;
create policy trip_operator_notes_admin_operador_read on trip_operator_notes
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = trip_operator_notes.tenant_id
  )
);

drop policy if exists trip_operator_notes_admin_operador_insert on trip_operator_notes;
create policy trip_operator_notes_admin_operador_insert on trip_operator_notes
for insert
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = trip_operator_notes.tenant_id
      and p.id = trip_operator_notes.author_profile_id
  )
);

-- Reivindicações: leitura admin/operador (coordenação multiatendimento)
drop policy if exists trip_operational_claims_read on trip_operational_claims;
create policy trip_operational_claims_read on trip_operational_claims
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = trip_operational_claims.tenant_id
  )
);

drop policy if exists trip_operational_claims_insert on trip_operational_claims;
create policy trip_operational_claims_insert on trip_operational_claims
for insert
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operador')
      and p.tenant_id = trip_operational_claims.tenant_id
      and p.id = trip_operational_claims.operator_profile_id
  )
);

drop policy if exists trip_operational_claims_update on trip_operational_claims;
create policy trip_operational_claims_update on trip_operational_claims
for update
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = trip_operational_claims.tenant_id
      and (
        p.role = 'admin'
        or (p.role = 'operador' and trip_operational_claims.operator_profile_id = p.id)
      )
  )
);

alter table trip_operator_notes replica identity full;
alter table trip_operational_claims replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_operator_notes'
  ) then
    alter publication supabase_realtime add table public.trip_operator_notes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_operational_claims'
  ) then
    alter publication supabase_realtime add table public.trip_operational_claims;
  end if;
end
$$;

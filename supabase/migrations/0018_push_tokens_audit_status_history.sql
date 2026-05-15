-- Tokens FCM/Web para motoristas (push real). Índice de auditoria por entidade no tenant.

create table if not exists driver_push_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  driver_id uuid not null references drivers (id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  constraint driver_push_tokens_token_len check (char_length(trim(token)) >= 20),
  unique (driver_id)
);

create index if not exists idx_driver_push_tokens_tenant_driver
  on driver_push_tokens (tenant_id, driver_id);

alter table driver_push_tokens enable row level security;

drop policy if exists driver_push_tokens_driver_all on driver_push_tokens;
create policy driver_push_tokens_driver_all on driver_push_tokens
for all
using (
  exists (
    select 1 from drivers d
    join profiles p on p.id = d.profile_id
    where d.id = driver_push_tokens.driver_id
      and p.id = auth.uid()
      and p.tenant_id = driver_push_tokens.tenant_id
  )
)
with check (
  exists (
    select 1 from drivers d
    join profiles p on p.id = d.profile_id
    where d.id = driver_push_tokens.driver_id
      and p.id = auth.uid()
      and p.tenant_id = driver_push_tokens.tenant_id
  )
);

create index if not exists idx_audit_events_tenant_entity_id
  on audit_events (tenant_id, entity_id, created_at desc)
  where entity_id is not null;

alter table trip_status_history enable row level security;

drop policy if exists trip_status_history_operational_read on trip_status_history;
create policy trip_status_history_operational_read on trip_status_history
for select
using (
  exists (
    select 1 from trips t
    join profiles p on p.id = auth.uid()
    where t.id = trip_status_history.trip_id
      and t.tenant_id = p.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

drop policy if exists trip_status_history_driver_read on trip_status_history;
create policy trip_status_history_driver_read on trip_status_history
for select
using (
  exists (
    select 1 from trips t
    join profiles p on p.id = auth.uid()
    join drivers d on d.profile_id = p.id
    where t.id = trip_status_history.trip_id
      and t.driver_id = d.id
      and p.role = 'motorista'
  )
);

drop policy if exists trip_status_history_client_read on trip_status_history;
create policy trip_status_history_client_read on trip_status_history
for select
using (
  exists (
    select 1 from trips t
    join profiles p on p.id = auth.uid()
    where t.id = trip_status_history.trip_id
      and t.client_id = p.client_id
      and p.role = 'cliente'
  )
);

alter table trip_status_history replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_status_history'
  ) then
    alter publication supabase_realtime add table public.trip_status_history;
  end if;
end
$$;

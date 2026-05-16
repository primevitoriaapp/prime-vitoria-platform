alter table drivers
  add column if not exists operational_status text not null default 'offline'
    check (operational_status in ('online','ocupado','deslocando','no_local','em_atendimento','offline')),
  add column if not exists operational_status_updated_at timestamptz not null default now();

create index if not exists idx_drivers_tenant_operational_status
  on drivers (tenant_id, operational_status)
  where active = true;

alter table drivers replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'drivers'
  ) then
    alter publication supabase_realtime add table public.drivers;
  end if;
end $$;

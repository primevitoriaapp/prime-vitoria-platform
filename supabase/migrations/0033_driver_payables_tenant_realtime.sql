-- tenant_id em contas a pagar (motorista) + realtime.

alter table driver_payables
  add column if not exists tenant_id uuid references tenants (id);

update driver_payables dp
set tenant_id = t.tenant_id
from trips t
where t.id = dp.trip_id
  and dp.tenant_id is null;

update driver_payables
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table driver_payables alter column tenant_id set not null;

create index if not exists idx_driver_payables_tenant_status_due
  on driver_payables (tenant_id, status, due_date);

alter table driver_payables replica identity full;

drop policy if exists driver_payables_finance_read on driver_payables;
create policy driver_payables_finance_read on driver_payables
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = driver_payables.tenant_id
      and p.role in ('admin', 'financeiro')
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_payables'
  ) then
    alter publication supabase_realtime add table public.driver_payables;
  end if;
end $$;

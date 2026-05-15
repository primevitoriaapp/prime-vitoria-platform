-- tenant_id em titulos a receber: RLS, realtime e filtros no painel financeiro.

alter table accounts_receivable
  add column if not exists tenant_id uuid references tenants (id);

update accounts_receivable ar
set tenant_id = t.tenant_id
from trips t
where t.id = ar.trip_id
  and ar.tenant_id is null;

update accounts_receivable
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table accounts_receivable alter column tenant_id set not null;

create index if not exists idx_accounts_receivable_tenant_status_due
  on accounts_receivable (tenant_id, status, due_date);

alter table accounts_receivable replica identity full;

drop policy if exists accounts_receivable_finance_read on accounts_receivable;
create policy accounts_receivable_finance_read on accounts_receivable
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = accounts_receivable.tenant_id
      and p.role in ('admin', 'financeiro', 'operador')
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts_receivable'
  ) then
    alter publication supabase_realtime add table public.accounts_receivable;
  end if;
end $$;

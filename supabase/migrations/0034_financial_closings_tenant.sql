-- Fechamento mensal por tenant (multiempresa).

alter table financial_closings
  add column if not exists tenant_id uuid references tenants (id);

update financial_closings
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table financial_closings alter column tenant_id set not null;

alter table financial_closings drop constraint if exists financial_closings_period_start_period_end_entity_type_entity_id_key;
alter table financial_closings
  add constraint financial_closings_tenant_period_entity_key
  unique (tenant_id, period_start, period_end, entity_type, entity_id);

create index if not exists idx_financial_closings_tenant_period
  on financial_closings (tenant_id, period_start desc, period_end desc);

alter table financial_closings replica identity full;

drop policy if exists financial_closings_finance_read on financial_closings;
create policy financial_closings_finance_read on financial_closings
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = financial_closings.tenant_id
      and p.role in ('admin', 'financeiro')
  )
);

drop policy if exists financial_closings_finance_write on financial_closings;
create policy financial_closings_finance_write on financial_closings
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = financial_closings.tenant_id
      and p.role in ('admin', 'financeiro')
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = financial_closings.tenant_id
      and p.role in ('admin', 'financeiro')
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'financial_closings'
  ) then
    alter publication supabase_realtime add table public.financial_closings;
  end if;
end $$;

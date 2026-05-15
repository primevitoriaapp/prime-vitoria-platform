-- Divergencias ERP: leitura/atualizacao por tenant + realtime para paineis operacionais.

alter table erp_reconciliation_issues replica identity full;

drop policy if exists erp_reconciliation_issues_operational_read on erp_reconciliation_issues;
create policy erp_reconciliation_issues_operational_read on erp_reconciliation_issues
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = erp_reconciliation_issues.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

drop policy if exists erp_reconciliation_issues_operational_resolve on erp_reconciliation_issues;
create policy erp_reconciliation_issues_operational_resolve on erp_reconciliation_issues
for update
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = erp_reconciliation_issues.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
  and status = 'open'
)
with check (
  status = 'resolved'
  and resolved_at is not null
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'erp_reconciliation_issues'
  ) then
    alter publication supabase_realtime add table public.erp_reconciliation_issues;
  end if;
end
$$;

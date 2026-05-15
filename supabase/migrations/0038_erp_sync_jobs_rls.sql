-- Leitura da fila ERP por tenant (staff com permissão de integração).

alter table erp_sync_jobs enable row level security;

drop policy if exists erp_sync_jobs_tenant_staff_select on erp_sync_jobs;
create policy erp_sync_jobs_tenant_staff_select on erp_sync_jobs
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = erp_sync_jobs.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

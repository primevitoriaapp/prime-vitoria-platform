-- Fila ERP: tenant_id para isolamento multiempresa e fila unica por entidade em "queued".

alter table erp_sync_jobs
  add column if not exists tenant_id uuid references tenants (id);

update erp_sync_jobs j
set tenant_id = t.tenant_id
from accounts_receivable ar
join trips t on t.id = ar.trip_id
where j.entity_type = 'receivable'
  and j.entity_id = ar.id::text
  and j.tenant_id is null;

update erp_sync_jobs
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table erp_sync_jobs alter column tenant_id set not null;

create index if not exists idx_erp_sync_jobs_tenant_status_created
  on erp_sync_jobs (tenant_id, status, created_at desc);

create unique index if not exists uq_erp_sync_jobs_queued_entity
  on erp_sync_jobs (tenant_id, provider, entity_type, entity_id)
  where (status = 'queued');

comment on column erp_sync_jobs.tenant_id is 'Organizacao; POST /api/integrations/jobs valida titulo vs tenant da sessao.';

-- Fila de notificacoes: escopo multiempresa (filtro em processadores e listagens futuras).

alter table notification_jobs
  add column if not exists tenant_id uuid references tenants (id);

update notification_jobs
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table notification_jobs alter column tenant_id set not null;

create index if not exists idx_notification_jobs_tenant_status_created
  on notification_jobs (tenant_id, status, created_at asc);

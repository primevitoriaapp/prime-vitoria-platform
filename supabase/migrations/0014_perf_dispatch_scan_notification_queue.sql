-- Índices parciais para consultas frequentes (varredura de despacho direto, fila de notificações).

create index if not exists idx_trips_tenant_approved_no_driver_scheduled
  on trips (tenant_id, scheduled_at asc)
  where operational_status = 'approved' and driver_id is null;

create index if not exists idx_notification_jobs_queued_created
  on notification_jobs (created_at asc)
  where status = 'queued';

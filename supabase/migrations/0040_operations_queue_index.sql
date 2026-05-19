-- Fila operacional: tenant + estados activos + agenda (ordenação por scheduled_at).

create index if not exists idx_trips_tenant_active_queue_scheduled
  on trips (tenant_id, scheduled_at asc)
  where operational_status in (
    'requested',
    'approved',
    'dispatched',
    'accepted',
    'on_the_way',
    'arrived',
    'in_progress'
  );

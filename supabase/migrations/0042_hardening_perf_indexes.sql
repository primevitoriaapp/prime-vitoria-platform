-- Performance indexes (additive, non-destructive). RLS changes documented in docs/RLS_AUDIT_NIGHT_CYCLE.md.

create index if not exists idx_trips_tenant_status_scheduled
  on trips (tenant_id, operational_status, scheduled_at desc);

create index if not exists idx_trips_tenant_driver_active
  on trips (tenant_id, driver_id, scheduled_at desc)
  where operational_status in (
    'dispatched',
    'accepted',
    'on_the_way',
    'arrived',
    'in_progress'
  );

create index if not exists idx_trip_financials_pricing_rule
  on trip_financials (pricing_rule_id)
  where pricing_rule_id is not null;

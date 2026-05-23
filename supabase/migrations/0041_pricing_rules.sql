-- Motor de precificação por cliente (tenant-scoped).

create type pricing_calculation_type as enum (
  'fixed_price',
  'km_with_minimum',
  'daily_rate',
  'hourly_plus_extra',
  'event_package',
  'custom'
);

create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  name text not null default 'Regra padrão',
  calculation_type pricing_calculation_type not null,
  active boolean not null default true,
  priority int not null default 0,
  fixed_price numeric(12, 2),
  price_per_km numeric(12, 4),
  minimum_km numeric(10, 2),
  minimum_value numeric(12, 2),
  included_hours numeric(6, 2),
  extra_hour_value numeric(12, 2),
  included_km numeric(10, 2),
  extra_km_value numeric(12, 4),
  night_fee numeric(12, 2),
  holiday_fee numeric(12, 2),
  toll_policy text check (toll_policy is null or toll_policy in ('client', 'company', 'split')),
  parking_policy text check (parking_policy is null or parking_policy in ('client', 'company', 'split')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pricing_rules_tenant_client_active
  on pricing_rules (tenant_id, client_id, active, priority desc, created_at desc);

alter table trips
  add column if not exists km_billable numeric(10, 2),
  add column if not exists pricing_rule_id uuid references pricing_rules (id),
  add column if not exists calculation_metadata jsonb;

alter table trip_financials
  add column if not exists pricing_rule_id uuid references pricing_rules (id),
  add column if not exists calculation_metadata jsonb;

alter table pricing_rules enable row level security;

drop policy if exists pricing_rules_tenant_read on pricing_rules;
create policy pricing_rules_tenant_read on pricing_rules
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = pricing_rules.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

drop policy if exists pricing_rules_tenant_write on pricing_rules;
create policy pricing_rules_tenant_write on pricing_rules
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = pricing_rules.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = pricing_rules.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

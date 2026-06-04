-- Modelo Prime Vitória: preço cliente + repasse motorista por tipo de serviço.

alter table client_pricing_rules
  add column if not exists driver_price_per_km numeric(12, 4),
  add column if not exists driver_fixed_price numeric(12, 2),
  add column if not exists driver_min_km numeric(10, 2);

alter table trips
  add column if not exists client_amount numeric(12, 2),
  add column if not exists driver_amount numeric(12, 2),
  add column if not exists margin numeric(12, 2);

create table if not exists driver_payout_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  driver_id uuid not null references drivers (id) on delete cascade,
  service_type text not null,
  charge_type text not null check (charge_type in ('per_km', 'fixed', 'daily', 'hourly')),
  price_per_km numeric(12, 4),
  min_km numeric(10, 2),
  fixed_price numeric(12, 2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, service_type)
);

create index if not exists idx_driver_payout_rules_driver
  on driver_payout_rules (tenant_id, driver_id, active);

alter table driver_payout_rules enable row level security;

drop policy if exists driver_payout_rules_tenant_rw on driver_payout_rules;
create policy driver_payout_rules_tenant_rw on driver_payout_rules
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = driver_payout_rules.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = driver_payout_rules.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

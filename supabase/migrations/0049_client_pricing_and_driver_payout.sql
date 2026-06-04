-- Regras de cobrança por cliente + repasse no motorista (P1).

create table if not exists client_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  service_type text not null default 'default',
  charge_type text not null check (charge_type in ('per_km', 'fixed', 'daily', 'hourly')),
  price_per_km numeric(12, 4),
  min_km numeric(10, 2),
  wait_tolerance_minutes int not null default 10,
  wait_price_per_hour numeric(12, 2),
  fixed_price numeric(12, 2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, service_type)
);

create index if not exists idx_client_pricing_rules_client
  on client_pricing_rules (tenant_id, client_id, active);

alter table drivers
  add column if not exists payout_price_per_km numeric(12, 4),
  add column if not exists payout_percent numeric(5, 2);

alter table client_pricing_rules enable row level security;

drop policy if exists client_pricing_rules_tenant_rw on client_pricing_rules;
create policy client_pricing_rules_tenant_rw on client_pricing_rules
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = client_pricing_rules.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = client_pricing_rules.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

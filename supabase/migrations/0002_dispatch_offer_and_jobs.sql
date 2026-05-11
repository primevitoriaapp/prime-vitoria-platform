create table if not exists dispatch_offers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  status text not null check (status in ('open', 'approved', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_driver_id uuid references drivers(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists dispatch_offer_recipients (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references dispatch_offers(id) on delete cascade,
  driver_id uuid not null references drivers(id),
  notified_at timestamptz not null,
  unique(offer_id, driver_id)
);

create table if not exists dispatch_offer_responses (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references dispatch_offers(id) on delete cascade,
  driver_id uuid not null references drivers(id),
  status text not null check (status in ('accepted', 'rejected')),
  eta_minutes int,
  responded_at timestamptz not null default now(),
  unique(offer_id, driver_id)
);

create index if not exists idx_dispatch_offers_status_expires on dispatch_offers(status, expires_at);
create index if not exists idx_dispatch_offers_trip on dispatch_offers(trip_id);
create index if not exists idx_dispatch_offer_responses_offer_status on dispatch_offer_responses(offer_id, status);

create table if not exists financial_closings (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  entity_type text not null check (entity_type in ('client', 'driver')),
  entity_id text not null,
  gross_amount numeric(12,2) not null,
  cost_amount numeric(12,2) not null,
  margin_amount numeric(12,2) not null,
  status text not null check (status in ('draft', 'closed', 'reopened')),
  closed_by uuid references profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(period_start, period_end, entity_type, entity_id)
);

create table if not exists erp_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('conta_azul','omie')),
  entity_type text not null,
  entity_id text not null,
  issue_type text not null check (issue_type in ('amount_mismatch', 'missing_external', 'status_mismatch')),
  details jsonb not null default '{}'::jsonb,
  status text not null check (status in ('open','resolved')) default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table dispatch_offers enable row level security;
alter table dispatch_offer_responses enable row level security;
alter table financial_closings enable row level security;
alter table erp_reconciliation_issues enable row level security;

create policy dispatch_offers_admin_operator on dispatch_offers
for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','operador')
));

create policy dispatch_offer_responses_driver_own on dispatch_offer_responses
for insert
with check (exists (
  select 1
  from profiles p
  join drivers d on d.profile_id = p.id
  where p.id = auth.uid() and p.role = 'motorista' and d.id = dispatch_offer_responses.driver_id
));

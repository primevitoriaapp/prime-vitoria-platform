create extension if not exists "pgcrypto";

create type user_role as enum ('admin', 'operador', 'financeiro', 'cliente', 'motorista');
create type trip_dispatch_mode as enum ('directed', 'offer');
create type trip_operational_status as enum (
  'requested',
  'approved',
  'dispatched',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'rejected',
  'no_show',
  'reassigned'
);
create type trip_financial_status as enum ('pending', 'partially_paid', 'paid', 'cancelled');

create table profiles (
  id uuid primary key,
  name text not null,
  phone text,
  role user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('PF','PJ')),
  name text not null,
  document text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table client_units (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  created_at timestamptz not null default now()
);

create table client_departments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  created_at timestamptz not null default now()
);

create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  code text,
  name text not null,
  created_at timestamptz not null default now()
);

create table requesters (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  email text,
  phone text,
  registration text,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references profiles(id),
  cpf text not null,
  cnh_number text,
  cnh_category text,
  cnh_expiry date,
  pix_key text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  plate text not null unique,
  category text,
  capacity int,
  color text,
  status text default 'available',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table driver_vehicle_links (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  vehicle_id uuid not null references vehicles(id),
  start_at timestamptz not null default now(),
  end_at timestamptz,
  active boolean not null default true
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  requester_id uuid references requesters(id),
  cost_center_id uuid references cost_centers(id),
  unit_id uuid references client_units(id),
  department_id uuid references client_departments(id),
  service_type text not null,
  scheduled_at timestamptz not null,
  pickup_window_start timestamptz,
  pickup_window_end timestamptz,
  origin_text text not null,
  origin_lat numeric(10,7),
  origin_lng numeric(10,7),
  destination_text text not null,
  destination_lat numeric(10,7),
  destination_lng numeric(10,7),
  passenger_name text,
  passenger_phone text,
  notes text,
  dispatch_mode trip_dispatch_mode not null default 'directed',
  driver_id uuid references drivers(id),
  vehicle_id uuid references vehicles(id),
  operational_status trip_operational_status not null default 'requested',
  financial_status trip_financial_status not null default 'pending',
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  cancel_reason text,
  reassign_reason text,
  created_at timestamptz not null default now()
);

create table trip_status_history (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  from_status trip_operational_status,
  to_status trip_operational_status not null,
  changed_by uuid references profiles(id),
  source text not null check (source in ('admin','driver','system')),
  note text,
  changed_at timestamptz not null default now()
);

create table driver_locations (
  id bigserial primary key,
  driver_id uuid not null references drivers(id),
  trip_id uuid references trips(id),
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  speed numeric(6,2),
  heading numeric(6,2),
  recorded_at timestamptz not null default now()
);

create table trip_financials (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid unique not null references trips(id) on delete cascade,
  amount_client numeric(12,2) not null default 0,
  amount_driver numeric(12,2) not null default 0,
  tolls numeric(12,2) not null default 0,
  parking numeric(12,2) not null default 0,
  extras numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  net_margin numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  client_id uuid not null references clients(id),
  amount numeric(12,2) not null,
  issue_date date,
  due_date date not null,
  status text not null default 'open',
  paid_at timestamptz,
  payment_method text,
  reference text,
  created_at timestamptz not null default now()
);

create table driver_payables (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  driver_id uuid not null references drivers(id),
  amount numeric(12,2) not null,
  due_date date not null,
  status text not null default 'open',
  paid_at timestamptz,
  payment_method text,
  batch_id text,
  created_at timestamptz not null default now()
);

create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null,
  status text not null default 'queued',
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  next_retry_at timestamptz,
  idempotency_key text,
  correlation_id text not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references notification_jobs(id),
  channel text not null,
  recipient_type text not null,
  recipient_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table erp_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('conta_azul','omie')),
  company_id text not null,
  credentials_encrypted text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table erp_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('conta_azul','omie')),
  entity_type text not null,
  internal_id text not null,
  external_id text not null,
  sync_status text not null,
  last_sync_at timestamptz,
  unique(provider, entity_type, internal_id)
);

create table erp_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('conta_azul','omie')),
  direction text not null check (direction in ('outbound','inbound')),
  entity_type text not null,
  entity_id text not null,
  status text not null,
  attempt_count int not null default 0,
  next_retry_at timestamptz,
  last_error text,
  payload_snapshot jsonb,
  response_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index idx_trips_scheduled_at on trips(scheduled_at);
create index idx_trips_status on trips(operational_status);
create index idx_trips_driver_id on trips(driver_id);
create index idx_trips_client_id on trips(client_id);
create index idx_driver_locations_driver_time on driver_locations(driver_id, recorded_at desc);
create index idx_trip_status_history_trip_time on trip_status_history(trip_id, changed_at desc);
create index idx_notification_jobs_status_next_retry on notification_jobs(status, next_retry_at);
create index idx_erp_sync_jobs_status_next_retry on erp_sync_jobs(status, next_retry_at);

create or replace function log_trip_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into trip_status_history(trip_id, from_status, to_status, changed_by, source, note)
    values (new.id, null, new.operational_status, new.created_by, 'system', 'Trip criada');
    return new;
  end if;

  if new.operational_status is distinct from old.operational_status then
    insert into trip_status_history(trip_id, from_status, to_status, changed_by, source, note)
    values (new.id, old.operational_status, new.operational_status, coalesce(new.approved_by, old.approved_by), 'admin', null);
  end if;

  return new;
end;
$$;

create trigger trg_trip_status_history
after insert or update on trips
for each row
execute function log_trip_status_change();

create or replace function calc_trip_margin()
returns trigger
language plpgsql
as $$
begin
  new.net_margin :=
    (new.amount_client + new.extras) - (new.amount_driver + new.tolls + new.parking + new.discount);
  return new;
end;
$$;

create trigger trg_calc_trip_margin
before insert or update on trip_financials
for each row
execute function calc_trip_margin();

alter table clients enable row level security;
alter table trips enable row level security;
alter table drivers enable row level security;
alter table vehicles enable row level security;
alter table accounts_receivable enable row level security;
alter table driver_payables enable row level security;

create policy clients_admin_full on clients
for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','operador')
));

create policy clients_self_read on clients
for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'cliente'
));

create policy trips_admin_operator on trips
for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','operador')
));

create policy trips_driver_assigned on trips
for select
using (exists (
  select 1 from profiles p
  join drivers d on d.profile_id = p.id
  where p.id = auth.uid() and p.role = 'motorista' and d.id = trips.driver_id
));

create policy trips_client_own on trips
for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'cliente'
));

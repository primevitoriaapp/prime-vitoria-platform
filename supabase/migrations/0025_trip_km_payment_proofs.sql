-- Distância planeada/real e comprovantes de pagamento ao motorista.

alter table trips
  add column if not exists planned_km numeric(10, 2),
  add column if not exists actual_km numeric(10, 2),
  add column if not exists km_source text check (km_source in ('coords', 'gps_trail', 'manual')),
  add column if not exists km_updated_at timestamptz;

comment on column trips.planned_km is 'Distância estimada origem→destino (haversine ou manual).';
comment on column trips.actual_km is 'Distância realizada (trail GPS ou manual).';

create table if not exists driver_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  driver_payable_id uuid not null references driver_payables (id) on delete cascade,
  trip_id uuid not null references trips (id) on delete cascade,
  storage_url text not null,
  amount numeric(12, 2),
  notes text,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint driver_payment_proofs_url_len check (char_length(trim(storage_url)) >= 8)
);

create index if not exists idx_driver_payment_proofs_payable
  on driver_payment_proofs (driver_payable_id, created_at desc);

create index if not exists idx_driver_payment_proofs_tenant_trip
  on driver_payment_proofs (tenant_id, trip_id);

alter table driver_payment_proofs enable row level security;

drop policy if exists driver_payment_proofs_finance_read on driver_payment_proofs;
create policy driver_payment_proofs_finance_read on driver_payment_proofs
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = driver_payment_proofs.tenant_id
      and p.role in ('admin', 'financeiro')
  )
);

drop policy if exists driver_payment_proofs_finance_write on driver_payment_proofs;
create policy driver_payment_proofs_finance_write on driver_payment_proofs
for insert
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = driver_payment_proofs.tenant_id
      and p.role in ('admin', 'financeiro')
  )
);

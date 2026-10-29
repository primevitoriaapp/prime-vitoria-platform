-- App do motorista: KM do painel (inicial/final) e assinatura do passageiro em corridas corporativas.
alter table public.trips
  add column if not exists odometer_start numeric(10,1),
  add column if not exists odometer_end numeric(10,1);

create table if not exists public.trip_signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  trip_id uuid not null references public.trips(id) on delete cascade,
  signer_name text,
  image_data text,
  skipped_reason text,
  driver_id uuid,
  created_at timestamptz not null default now(),
  constraint trip_signatures_one_per_trip unique (trip_id),
  constraint trip_signatures_signed_or_reason check (image_data is not null or coalesce(trim(skipped_reason), '') <> '')
);

alter table public.trip_signatures enable row level security;
create index if not exists trip_signatures_tenant_idx on public.trip_signatures (tenant_id, created_at desc);

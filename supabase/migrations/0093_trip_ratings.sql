create table if not exists public.trip_ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  trip_id uuid not null unique references public.trips(id) on delete cascade,
  driver_id uuid,
  client_id uuid,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
alter table public.trip_ratings enable row level security;
create index if not exists trip_ratings_driver_idx on public.trip_ratings (driver_id, created_at desc);

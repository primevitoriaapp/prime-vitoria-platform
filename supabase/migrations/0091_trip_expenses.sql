create table if not exists public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  trip_id uuid not null references public.trips(id) on delete cascade,
  driver_id uuid,
  kind text not null check (kind in ('pedagio','estacionamento','combustivel','alimentacao','outros')),
  amount numeric(10,2) not null check (amount > 0),
  receipt_path text,
  notes text,
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  charge_client boolean not null default false,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.trip_expenses enable row level security;
create index if not exists trip_expenses_trip_idx on public.trip_expenses (trip_id);
create index if not exists trip_expenses_status_idx on public.trip_expenses (tenant_id, status);
insert into storage.buckets (id, name, public) values ('trip-expenses', 'trip-expenses', false) on conflict (id) do nothing;

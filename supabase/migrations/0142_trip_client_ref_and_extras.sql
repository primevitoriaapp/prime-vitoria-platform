-- NR / referência do cliente como coluna (lida da linha "O.S./Ref.:" das observações; sempre em sincronia).
alter table public.trips
  add column if not exists client_ref text
  generated always as (upper(substring(notes from 'O\.S\./Ref\.:\s*([^\s,;]+)'))) stored;
alter table public.trips
  add column if not exists client_ref_base text
  generated always as (upper(split_part(substring(notes from 'O\.S\./Ref\.:\s*([^\s,;]+)'), '-', 1))) stored;
create index if not exists trips_client_ref_base_idx on public.trips (tenant_id, client_id, client_ref_base) where client_ref_base is not null;

-- Adicionais lançados pela central (hora extra, espera, estacionamento, pedágio, outro).
-- O valor já entra somado no valor da corrida (client_amount / driver_amount); aqui fica o detalhe para a fatura.
create table if not exists public.trip_extras (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('hora_extra','espera','estacionamento','pedagio','outro')),
  description text,
  minutes integer,
  client_amount numeric(12,2) not null default 0,
  driver_amount numeric(12,2) not null default 0,
  replaced_wait_client numeric(12,2) not null default 0,
  replaced_wait_driver numeric(12,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists trip_extras_trip_idx on public.trip_extras (trip_id);
alter table public.trip_extras enable row level security;

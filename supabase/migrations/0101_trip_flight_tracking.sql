-- Acompanhamento automático do voo (AeroDataBox).
alter table public.trips add column if not exists flight_status text;
alter table public.trips add column if not exists flight_scheduled_at timestamptz;
alter table public.trips add column if not exists flight_eta timestamptz;
alter table public.trips add column if not exists flight_delay_minutes integer;
alter table public.trips add column if not exists flight_leg text check (flight_leg in ('arrival', 'departure'));
alter table public.trips add column if not exists flight_airport text;
alter table public.trips add column if not exists flight_checked_at timestamptz;
alter table public.trips add column if not exists flight_check_count integer not null default 0;
alter table public.trips add column if not exists flight_error text;

comment on column public.trips.flight_eta is 'Horário previsto atualizado (pouso se buscar no aeroporto; decolagem se levar ao aeroporto).';

create index if not exists trips_flight_watch_idx on public.trips (scheduled_at) where flight_number is not null;

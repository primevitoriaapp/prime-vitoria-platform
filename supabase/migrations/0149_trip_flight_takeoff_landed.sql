-- Voo acompanhado pelo Flightradar24: horário real de decolagem e pouso e quais avisos já foram dados.
alter table public.trips
  add column if not exists flight_departed_at timestamptz,
  add column if not exists flight_landed_at timestamptz,
  add column if not exists flight_alerts jsonb not null default '{}'::jsonb;

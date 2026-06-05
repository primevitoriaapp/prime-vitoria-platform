-- Tempo de espera do passageiro (app motorista).

alter table public.trips
  add column if not exists wait_minutes integer not null default 0,
  add column if not exists wait_started_at timestamptz;

comment on column public.trips.wait_minutes is 'Minutos acumulados aguardando passageiro';
comment on column public.trips.wait_started_at is 'Início do intervalo de espera activo (UTC)';

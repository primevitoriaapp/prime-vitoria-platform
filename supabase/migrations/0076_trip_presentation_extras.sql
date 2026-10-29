alter table public.trips
  add column if not exists presentation_minutes smallint check (presentation_minutes is null or (presentation_minutes >= 0 and presentation_minutes <= 240)),
  add column if not exists service_extras text[] not null default '{}';
comment on column public.trips.presentation_minutes is 'Minutos antes do horário em que o motorista deve chegar no local de embarque';
comment on column public.trips.service_extras is 'Marcações da reserva: placa_nome, agua, cadeirinha, assento_elevacao, bilingue, traje_social, ajuda_bagagem, receptivo';

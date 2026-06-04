alter table public.trips
  add column if not exists passenger_count integer;

update public.trips
set passenger_count = 1
where passenger_count is null;

alter table public.trips
  alter column passenger_count set default 1;

comment on column public.trips.passenger_count is 'Número de passageiros na corrida';

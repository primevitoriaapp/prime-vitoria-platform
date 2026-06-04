-- Trechos múltiplos por corrida (origem/destino/valores por trecho)
alter table public.trips
  add column if not exists trip_legs jsonb;

comment on column public.trips.trip_legs is 'Array JSON de trechos: origem, destino, client_amount, driver_amount, coords opcionais';

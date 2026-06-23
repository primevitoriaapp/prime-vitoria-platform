-- Paradas de embarque com passageiros distintos (mesmo destino final)
alter table public.trips
  add column if not exists trip_pickup_stops jsonb;

comment on column public.trips.trip_pickup_stops is
  'Array JSON de paradas: pickup_text, coords, passenger_name, passenger_phone, completed_at';

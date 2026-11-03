-- Lista de passageiros informada pelo motorista no embarque (uma parada de desembarque por passageiro).
alter table public.trips add column if not exists trip_dropoff_stops jsonb;
comment on column public.trips.trip_dropoff_stops is 'Lista de passageiros informada no embarque: passenger_id, passenger_name, address_text, lat, lng, dropped_at (uma parada de desembarque por passageiro).';
notify pgrst, 'reload schema';

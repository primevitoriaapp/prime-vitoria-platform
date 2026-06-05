-- Vínculo ida/volta entre corridas.

alter table public.trips
  add column if not exists trip_id_return uuid references public.trips (id) on delete set null;

alter table public.trips
  add column if not exists trip_leg_label text check (trip_leg_label in ('ida', 'volta'));

create index if not exists idx_trips_trip_id_return on public.trips (trip_id_return);

comment on column public.trips.trip_id_return is 'Corrida de volta vinculada (ida aponta para volta)';
comment on column public.trips.trip_leg_label is 'ida | volta para exibição no app motorista';

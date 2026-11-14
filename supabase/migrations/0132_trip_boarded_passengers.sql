alter table public.trips add column if not exists boarded_passengers jsonb;
comment on column public.trips.boarded_passengers is 'Quem embarcou (lista marcada pelo motorista no início): [{passenger_id, passenger_name}]. Não altera as paradas.';

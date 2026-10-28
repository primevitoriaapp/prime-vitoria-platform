-- Número do voo do passageiro (busca no aeroporto): motorista acompanha atraso pelo rastreador de voos.
alter table public.trips add column if not exists flight_number text;
comment on column public.trips.flight_number is 'Número do voo do passageiro (ex.: LA3345), para o motorista acompanhar atrasos.';

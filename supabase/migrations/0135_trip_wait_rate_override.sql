-- Valor da hora parada lançado pela central só para esta corrida (quando o cliente/veículo não tem valor cadastrado).
-- Formato: {"client": 60, "driver": 40} em R$ por hora.
alter table public.trips add column if not exists wait_rate_override jsonb;

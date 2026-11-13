-- Casamento: telefone da noiva e da cerimonialista (vão para a corrida e o motorista pode ligar).
alter table public.quotes add column if not exists bride_name text, add column if not exists bride_phone text, add column if not exists planner_name text, add column if not exists planner_phone text;

-- Orçamento guiado: tipo (casamento, empresarial, van...), roteiro com paradas nomeadas e pacote de noiva.
alter table public.quotes add column if not exists kind text;
alter table public.quote_items add column if not exists stops jsonb;
alter table public.quote_items add column if not exists origin_label text;
alter table public.quote_items add column if not exists destination_label text;
alter table public.quote_items add column if not exists package_id text;

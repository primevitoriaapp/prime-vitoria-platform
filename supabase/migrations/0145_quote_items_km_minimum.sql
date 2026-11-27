-- Km mínimo cobrado no orçamento por km.
alter table public.quote_items add column if not exists km_minimum numeric(10,2);

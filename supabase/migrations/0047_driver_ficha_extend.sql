-- Ficha completa do motorista (P1) — aditivo.

alter table drivers
  add column if not exists birth_date date,
  add column if not exists postal_code text,
  add column if not exists address_number text,
  add column if not exists state text,
  add column if not exists operational_status text not null default 'ativo',
  add column if not exists cnh_categories text[],
  add column if not exists operational_categories text[],
  add column if not exists service_regions text[];

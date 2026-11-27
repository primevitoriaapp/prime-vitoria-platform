-- Orçamento por km e rotina semanal (ex.: corporativo seg a sex, ida de manhã e volta à noite).
alter table public.quote_items
  add column if not exists km_estimate numeric(10,2),
  add column if not exists price_per_km numeric(10,2),
  add column if not exists driver_price_per_km numeric(10,2),
  add column if not exists repeat_weekdays smallint[],
  add column if not exists repeat_until date;


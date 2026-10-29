alter table public.clients add column if not exists km_minimum numeric(8,2) check (km_minimum is null or km_minimum >= 0);
comment on column public.clients.km_minimum is 'Km mínimo cobrado do cliente por corrida (cobrança por km)';

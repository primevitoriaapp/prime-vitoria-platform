alter table public.drivers add column if not exists vehicle_category_ids uuid[] not null default '{}';
alter table public.vehicle_categories add column if not exists allows_km boolean not null default false;
comment on column public.vehicle_categories.allows_km is 'Só categorias com esta marca podem ser cobradas por km';

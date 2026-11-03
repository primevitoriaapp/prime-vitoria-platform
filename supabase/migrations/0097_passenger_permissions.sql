-- Permissões por funcionário no portal da empresa: pode pedir corrida e quais categorias.
alter table public.client_passengers add column if not exists can_request boolean not null default true;
alter table public.client_passengers add column if not exists allowed_category_ids uuid[];
comment on column public.client_passengers.allowed_category_ids is 'Categorias que o funcionário pode pedir no portal (null = todas liberadas para a empresa).';

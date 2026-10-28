-- Categorias de veículos (com foto e lotação) e tabela de preços por empresa (categoria × serviço).

create table if not exists public.vehicle_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  description text,
  passengers integer not null default 4 check (passengers between 1 and 80),
  kind text not null default 'carro' check (kind in ('carro', 'van', 'onibus')),
  photo_path text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_vehicle_categories_tenant on public.vehicle_categories (tenant_id, sort);

create table if not exists public.client_category_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  client_id uuid not null references public.clients (id) on delete cascade,
  category_id uuid not null references public.vehicle_categories (id) on delete cascade,
  service text not null check (service in ('transfer', 'diaria_5h', 'diaria_10h', 'diaria_12h', 'km_b1', 'km_b2', 'hora_extra', 'hora_parada')),
  enabled boolean not null default false,
  client_price numeric(12, 2),
  partner_price numeric(12, 2),
  updated_at timestamptz not null default now(),
  unique (client_id, category_id, service)
);
create index if not exists idx_client_category_prices_client on public.client_category_prices (client_id);

alter table public.trips
  add column if not exists vehicle_category_id uuid references public.vehicle_categories (id) on delete set null,
  add column if not exists service_mode text;

alter table public.vehicle_categories enable row level security;
alter table public.client_category_prices enable row level security;
create policy vehicle_categories_read on public.vehicle_categories for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.tenant_id = vehicle_categories.tenant_id)
);
create policy vehicle_categories_staff_write on public.vehicle_categories for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.tenant_id = vehicle_categories.tenant_id and p.role in ('admin', 'operador'))
);
create policy client_category_prices_staff on public.client_category_prices for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.tenant_id = client_category_prices.tenant_id and p.role in ('admin', 'operador', 'financeiro'))
);

insert into public.vehicle_categories (tenant_id, name, description, passengers, kind, sort)
select 'a0000000-0000-0000-0000-000000000001', v.name, v.description, v.passengers, v.kind, v.sort
from (values
  ('Sedã Executivo', 'Sedã executivo com ar-condicionado e motorista de terno', 4, 'carro', 10),
  ('SUV Executivo', 'SUV executivo, mais espaço para bagagem', 4, 'carro', 20),
  ('Van Executiva', 'Van executiva para grupos', 15, 'van', 30),
  ('Micro-ônibus', 'Micro-ônibus executivo', 28, 'onibus', 40),
  ('Ônibus 46 lugares', 'Ônibus executivo', 46, 'onibus', 50),
  ('Ônibus 57 lugares', 'Ônibus executivo double', 57, 'onibus', 60)
) as v(name, description, passengers, kind, sort)
where exists (select 1 from public.tenants t where t.id = 'a0000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.vehicle_categories c where c.tenant_id = 'a0000000-0000-0000-0000-000000000001');

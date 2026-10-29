create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('PF','PJ')),
  name text not null check (length(trim(name)) >= 2),
  trade_name text,
  document text,
  phone text,
  whatsapp text,
  email text,
  pix_key text,
  city text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists partners_tenant_document on public.partners (tenant_id, document) where document is not null;
alter table public.partners enable row level security;
alter table public.vehicles add column if not exists partner_id uuid references public.partners(id) on delete set null;
alter table public.vehicles add column if not exists vehicle_category_id uuid references public.vehicle_categories(id) on delete set null;
alter table public.drivers add column if not exists partner_id uuid references public.partners(id) on delete set null;
create index if not exists vehicles_partner on public.vehicles (partner_id);
create index if not exists drivers_partner on public.drivers (partner_id);

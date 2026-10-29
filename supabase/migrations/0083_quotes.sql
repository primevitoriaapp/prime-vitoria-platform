create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number serial,
  client_id uuid references public.clients(id) on delete set null,
  contact_type text not null default 'PJ' check (contact_type in ('PF','PJ')),
  contact_name text,
  contact_document text,
  contact_phone text,
  contact_email text,
  issuer text check (issuer is null or issuer in ('rj_prime','prime_servicos','ilha_prime')),
  status text not null default 'rascunho' check (status in ('rascunho','enviado','aprovado','recusado','expirado','cancelado')),
  valid_until date,
  discount numeric(12,2) not null default 0,
  notes text,
  conditions text,
  total numeric(12,2) not null default 0,
  created_by uuid,
  sent_at timestamptz,
  approved_at timestamptz,
  refused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotes_tenant_status on public.quotes (tenant_id, status, created_at desc);
alter table public.quotes enable row level security;

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position int not null default 0,
  vehicle_category_id uuid references public.vehicle_categories(id) on delete set null,
  service_mode text not null default 'transfer' check (service_mode in ('transfer','diaria_5h','diaria_10h','diaria_12h','km','outro')),
  description text,
  scheduled_at timestamptz,
  origin_text text,
  origin_lat double precision,
  origin_lng double precision,
  destination_text text,
  destination_lat double precision,
  destination_lng double precision,
  passenger_count int not null default 1,
  passenger_name text,
  quantity int not null default 1 check (quantity >= 1 and quantity <= 50),
  unit_price numeric(12,2) not null default 0,
  driver_amount numeric(12,2),
  created_at timestamptz not null default now()
);
create index if not exists quote_items_quote on public.quote_items (quote_id, position);
alter table public.quote_items enable row level security;
alter table public.trips add column if not exists quote_id uuid references public.quotes(id) on delete set null;

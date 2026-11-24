-- PRIME CLUB: clube de benefícios dos motoristas parceiros.
-- Tudo administrável pelo painel; o app só lê o que está publicado. RLS ligado, só o servidor acessa.

create table if not exists public.club_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  icon text not null default 'tag',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.club_partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.club_categories(id) on delete set null,
  name text not null,
  description text,
  logo_url text,
  cover_url text,
  phone text,
  whatsapp text,
  website text,
  instagram text,
  status text not null default 'rascunho' check (status in ('rascunho','publicado','inativo')),
  publish_at timestamptz,
  featured boolean not null default false,
  validation_pin_hash text,
  contract_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists club_partners_tenant on public.club_partners(tenant_id, status);

create table if not exists public.club_branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  partner_id uuid not null references public.club_partners(id) on delete cascade,
  name text not null,
  address text,
  city text,
  uf text,
  lat double precision,
  lng double precision,
  hours text,
  phone text,
  whatsapp text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists club_branches_partner on public.club_branches(partner_id);

create table if not exists public.club_benefits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  partner_id uuid not null references public.club_partners(id) on delete cascade,
  branch_ids uuid[],                       -- vazio/nulo = vale em todas as filiais
  title text not null,
  description text,
  kind text not null check (kind in ('percentual','valor','por_litro','preco_exclusivo','cupom','gratuito','link','carteirinha')),
  value numeric(12,2),
  coupon_code text,
  external_url text,
  rules text,
  valid_from date,
  valid_until date,
  max_uses_per_driver int,                 -- nulo = sem limite
  max_uses_per_month int,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists club_benefits_partner on public.club_benefits(partner_id);

-- Código curto e de uso único gerado pela carteirinha (QR dinâmico). Expira em minutos.
create table if not exists public.club_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  code text not null unique,
  benefit_id uuid references public.club_benefits(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists club_tokens_driver on public.club_tokens(driver_id, created_at desc);

create table if not exists public.club_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  partner_id uuid not null references public.club_partners(id) on delete cascade,
  benefit_id uuid references public.club_benefits(id) on delete set null,
  branch_id uuid references public.club_branches(id) on delete set null,
  token_id uuid references public.club_tokens(id) on delete set null,
  purchase_amount numeric(12,2),
  saved_amount numeric(12,2),
  source text not null default 'qr' check (source in ('qr','cupom','central')),
  status text not null default 'registrado' check (status in ('registrado','cancelado')),
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists club_redemptions_driver on public.club_redemptions(driver_id, created_at desc);
create index if not exists club_redemptions_partner on public.club_redemptions(partner_id, created_at desc);

create table if not exists public.club_favorites (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  partner_id uuid not null references public.club_partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (driver_id, partner_id)
);

-- Hunter Prime Club: prospecção de estabelecimentos (CRM simples).
create table if not exists public.club_prospects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company text not null,
  category text,
  city text,
  contact_name text,
  phone text,
  email text,
  stage text not null default 'prospectado' check (stage in ('prospectado','contatado','aguardando_retorno','em_negociacao','aguardando_formalizacao','credenciado','publicado','perdido')),
  owner text,
  next_followup date,
  proposal text,
  notes text,
  partner_id uuid references public.club_partners(id) on delete set null,
  suggested_by_driver uuid references public.drivers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists club_prospects_tenant on public.club_prospects(tenant_id, stage);

-- Elegibilidade: por padrão todo motorista ativo participa; a central pode bloquear um motorista.
alter table public.drivers add column if not exists club_blocked boolean not null default false;

alter table public.club_categories enable row level security;
alter table public.club_partners enable row level security;
alter table public.club_branches enable row level security;
alter table public.club_benefits enable row level security;
alter table public.club_tokens enable row level security;
alter table public.club_redemptions enable row level security;
alter table public.club_favorites enable row level security;
alter table public.club_prospects enable row level security;

-- Imagens públicas dos parceiros (logo e capa).
insert into storage.buckets (id, name, public) values ('club-media', 'club-media', true) on conflict (id) do nothing;

-- Categorias iniciais (editáveis no painel).
insert into public.club_categories (tenant_id, name, icon, position)
select 'a0000000-0000-0000-0000-000000000001', c.name, c.icon, c.pos
from (values ('Combustível','fuel',1),('Pneus','tire',2),('Oficinas','wrench',3),('Estética automotiva','car',4),('Academias','dumbbell',5),('Seguros','shield',6),('Saúde','heart',7),('Alimentação','food',8),('Educação','school',9)) as c(name, icon, pos)
where not exists (select 1 from public.club_categories where tenant_id = 'a0000000-0000-0000-0000-000000000001');

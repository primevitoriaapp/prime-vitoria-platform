create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('motorista','empresa')),
  name text not null,
  phone text not null,
  email text,
  city text,
  company_name text,
  segment text,
  company_size text,
  use_cases text[],
  details jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  status text not null default 'novo' check (status in ('novo','em_contato','aprovado','descartado')),
  notes text,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_leads_tenant_created on public.site_leads(tenant_id, created_at desc);
alter table public.site_leads enable row level security;
comment on table public.site_leads is 'Cadastros vindos das páginas /seja-motorista e /para-empresas. Só o servidor grava/lê.';

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  issuer text not null check (issuer in ('rj_prime','prime_servicos','ilha_prime')),
  bank text not null,
  label text not null,
  agency text,
  account text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;

create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  fit_id text not null,
  posted_at date not null,
  amount numeric(14,2) not null,
  description text not null default '',
  status text not null default 'pendente' check (status in ('pendente','conciliado','ignorado')),
  match_kind text check (match_kind is null or match_kind in ('fatura','recebivel','conta_pagar','repasse','transferencia','nova_conta','outro')),
  match_id uuid,
  note text,
  resolved_by uuid,
  resolved_at timestamptz,
  imported_at timestamptz not null default now(),
  unique (bank_account_id, fit_id)
);
create index if not exists bank_lines_account_date on public.bank_statement_lines (bank_account_id, posted_at);
alter table public.bank_statement_lines enable row level security;

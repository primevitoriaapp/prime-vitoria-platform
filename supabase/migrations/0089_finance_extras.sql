alter table public.bank_accounts add column if not exists opening_balance numeric(14,2) not null default 0, add column if not exists opening_date date;

create table if not exists public.other_incomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  description text not null,
  category text not null default 'outros',
  client_id uuid,
  payer text,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'aberta' check (status in ('aberta','recebida','cancelada')),
  received_at date,
  received_amount numeric(14,2),
  issuer text check (issuer is null or issuer in ('rj_prime','prime_servicos','ilha_prime')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.other_incomes enable row level security;
create index if not exists other_incomes_tenant_due_idx on public.other_incomes (tenant_id, due_date);

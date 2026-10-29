create table if not exists public.company_payables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  description text not null check (length(trim(description)) >= 2),
  category text not null default 'outros',
  supplier text,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  status text not null default 'aberta' check (status in ('aberta','paga','cancelada')),
  paid_at date,
  paid_amount numeric(12,2),
  recurrence text not null default 'nenhuma' check (recurrence in ('nenhuma','mensal')),
  issuer text check (issuer is null or issuer in ('rj_prime','prime_servicos','ilha_prime')),
  notes text,
  attachment_path text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_payables_tenant_due on public.company_payables (tenant_id, status, due_date);
alter table public.company_payables enable row level security;

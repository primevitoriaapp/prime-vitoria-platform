create table if not exists public.finance_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  scope text not null default 'todas',
  revenue_goal numeric(14,2) not null check (revenue_goal >= 0),
  updated_at timestamptz not null default now(),
  unique (tenant_id, month, scope)
);
alter table public.finance_goals enable row level security;

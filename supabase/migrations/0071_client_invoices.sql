-- Fatura mensal por cliente: fecha as corridas concluídas do período, soma valores e KM,
-- fica disponível no portal do gestor (relatório + boleto quando houver integração bancária).

create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  tenant_id uuid not null references public.tenants (id),
  client_id uuid not null references public.clients (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  issue_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  due_date date not null,
  billing_issuer text,
  trip_count integer not null default 0,
  total_km numeric(12, 1) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  status text not null default 'aberta' check (status in ('aberta', 'enviada', 'paga', 'cancelada')),
  boleto_url text,
  boleto_line text,
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create unique index if not exists uq_client_invoices_period_active
  on public.client_invoices (client_id, period_start, period_end)
  where status <> 'cancelada';
create index if not exists idx_client_invoices_client on public.client_invoices (client_id, period_start desc);
create index if not exists idx_client_invoices_tenant on public.client_invoices (tenant_id, status);

alter table public.trips
  add column if not exists client_invoice_id uuid references public.client_invoices (id) on delete set null;
create index if not exists idx_trips_client_invoice on public.trips (client_invoice_id);

alter table public.client_invoices enable row level security;

create policy client_invoices_staff_all on public.client_invoices
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = client_invoices.tenant_id
        and p.role in ('admin', 'operador', 'financeiro')
    )
  );

create policy client_invoices_gestor_read on public.client_invoices
  for select using (
    status <> 'cancelada' and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'cliente' and p.client_id = client_invoices.client_id
        and p.client_access = 'gestor' and p.active
    )
  );

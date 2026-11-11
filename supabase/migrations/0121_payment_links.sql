-- Links de pagamento (InfinitePay) gerados pelo painel, ligados a orçamento ou corrida.
-- Quando o cliente paga, o aviso da InfinitePay é conferido e vira pagamento antecipado (booking_payments).
create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'infinitepay',
  quote_id uuid references public.quotes(id) on delete set null,
  trip_ids uuid[] not null default '{}',
  client_id uuid references public.clients(id) on delete set null,
  kind text not null default 'total' check (kind in ('sinal','saldo','total','outro')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  assured_installments int,
  order_nsu text not null unique,
  hook_token text not null,
  url text,
  slug text,
  status text not null default 'aberto' check (status in ('aberto','pago','cancelado','estornado')),
  paid_amount numeric(12,2),
  installments int,
  capture_method text,
  transaction_nsu text,
  receipt_url text,
  paid_at timestamptz,
  booking_payment_id uuid references public.booking_payments(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  raw jsonb
);
create index if not exists payment_links_quote_idx on public.payment_links (quote_id);
create index if not exists payment_links_trips_gin on public.payment_links using gin (trip_ids);
alter table public.payment_links enable row level security;

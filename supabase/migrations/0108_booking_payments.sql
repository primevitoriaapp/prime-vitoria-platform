-- Pagamentos antecipados (sinal / pagamento na reserva), antes da corrida acontecer.
-- Um pagamento vale para o pacote inteiro (trip_ids): ex. 5 diárias com 50% pago na reserva.
create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  trip_ids uuid[] not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'pix',
  account text,
  installments int,
  fee_amount numeric(12,2),
  paid_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists booking_payments_trip_ids_gin on public.booking_payments using gin (trip_ids);
create index if not exists booking_payments_tenant_idx on public.booking_payments (tenant_id, paid_on);
alter table public.booking_payments enable row level security;

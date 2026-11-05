-- Aplicado em produção em 05/11/2026 (colunas e índice novo).
alter table public.clients add column if not exists invoice_per_service boolean not null default false;
alter table public.client_invoices add column if not exists client_ref text;
alter table public.client_invoices add column if not exists voucher_path text;
alter table public.trips add column if not exists client_voucher_path text;
create unique index if not exists uq_client_invoices_period_ref_active
  on public.client_invoices (client_id, period_start, period_end, coalesce(client_ref, '')) where status <> 'cancelada';
-- PENDENTE (rodar no SQL Editor): o índice antigo impede 2 vouchers da CEP no mesmo dia.
-- drop index if exists public.uq_client_invoices_period_active;

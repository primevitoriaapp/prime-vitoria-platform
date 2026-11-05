-- Aplicado em produção em 05/11/2026.
alter table public.client_invoices add column if not exists payment_method text;
alter table public.client_invoices add column if not exists viewed_at timestamptz;

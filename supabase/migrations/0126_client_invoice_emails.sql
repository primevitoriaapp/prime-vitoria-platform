-- Vários e-mails de cobrança por cliente (ex.: CEP: financeiro1, financeiro2, financeiro4, valeria).
alter table public.clients add column if not exists invoice_emails text[] not null default '{}';

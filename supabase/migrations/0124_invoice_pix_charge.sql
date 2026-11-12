-- Fatura cobrada por PIX (sem boleto): conta escolhida e chave PIX aparecem na fatura, no PDF e no e-mail.
alter table public.bank_accounts add column if not exists pix_key text;
alter table public.bank_accounts add column if not exists holder_name text;
alter table public.bank_accounts add column if not exists holder_document text;
alter table public.client_invoices add column if not exists charge_method text check (charge_method in ('boleto','pix'));
alter table public.client_invoices add column if not exists charge_bank_account_id uuid references public.bank_accounts(id) on delete set null;

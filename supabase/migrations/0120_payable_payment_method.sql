alter table public.company_payables add column if not exists payment_method text, add column if not exists bank_account_id uuid;

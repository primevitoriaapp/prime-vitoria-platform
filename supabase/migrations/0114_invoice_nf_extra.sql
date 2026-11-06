alter table public.client_invoices add column if not exists nf_extra_paths text[] not null default '{}';

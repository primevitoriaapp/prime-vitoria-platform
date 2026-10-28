-- Cliente faturado ou pago antes do serviço; nota fiscal vinculada à fatura.
alter table public.clients add column if not exists invoiced boolean not null default true;
comment on column public.clients.invoiced is 'true = serviços entram na fatura do período; false = cliente paga antes (não faturado).';
alter table public.client_invoices add column if not exists nf_number text, add column if not exists nf_url text;

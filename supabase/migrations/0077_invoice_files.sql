alter table public.client_invoices
  add column if not exists boleto_path text,
  add column if not exists nf_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-files', 'invoice-files', false, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

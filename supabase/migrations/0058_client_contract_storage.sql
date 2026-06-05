-- Contrato PDF do cliente (portal + admin).

alter table public.clients
  add column if not exists contract_storage_path text;

comment on column public.clients.contract_storage_path is 'Path no bucket client-contracts (tenant/client/uuid.pdf)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-contracts',
  'client-contracts',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists client_contracts_service_all on storage.objects;
create policy client_contracts_service_all on storage.objects
for all
using (bucket_id = 'client-contracts')
with check (bucket_id = 'client-contracts');

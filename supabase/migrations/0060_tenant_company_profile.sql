-- Dados da empresa (cabeçalho, PDFs, voucher).

create table if not exists public.tenant_company_profiles (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  trade_name text not null default 'Prime Vitória',
  legal_name text not null default 'R J Prime Transporte LTDA',
  cnpj text,
  address_line text,
  phone text,
  email text,
  logo_storage_path text,
  updated_at timestamptz not null default now()
);

insert into public.tenant_company_profiles (
  tenant_id,
  trade_name,
  legal_name,
  cnpj,
  address_line,
  email
)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Prime Vitória',
  'R J Prime Transporte LTDA',
  '49.126.277/0001-54',
  'Rua Amélia da Cunha Ornellas 89, Bento Ferreira, Vitória ES',
  'contato@primevitoria.com'
)
on conflict (tenant_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-assets',
  'tenant-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tenant_assets_service_all on storage.objects;
create policy tenant_assets_service_all on storage.objects
for all
using (bucket_id = 'tenant-assets')
with check (bucket_id = 'tenant-assets');

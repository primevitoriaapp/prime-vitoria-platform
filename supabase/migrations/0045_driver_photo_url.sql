-- Foto do motorista (URL storage) — aditivo P1.

alter table drivers
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-photos',
  'driver-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Service role (API servidor) faz upload; políticas documentadas para auditoria.
drop policy if exists driver_photos_service_all on storage.objects;
create policy driver_photos_service_all on storage.objects
for all
using (bucket_id = 'driver-photos')
with check (bucket_id = 'driver-photos');

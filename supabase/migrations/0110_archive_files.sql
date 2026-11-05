-- Arquivo de backups (histórico da Omie, extratos antigos, contratos). Arquivos no bucket privado archive-files.
create table if not exists public.archive_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  category text not null default 'outros',
  title text not null,
  period text,
  file_path text not null,
  file_name text not null,
  size_bytes bigint,
  content_type text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists archive_files_tenant_idx on public.archive_files (tenant_id, category, created_at desc);
alter table public.archive_files enable row level security;
insert into storage.buckets (id, name, public, file_size_limit) values ('archive-files', 'archive-files', false, 104857600) on conflict (id) do nothing;

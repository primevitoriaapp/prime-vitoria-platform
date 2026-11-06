-- Anexos do financeiro (contas a pagar: boleto, comprovante, nota fiscal). Arquivos no bucket privado archive-files.
create table if not exists public.finance_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  kind text not null default 'outro',
  file_path text not null,
  file_name text not null,
  size_bytes bigint,
  content_type text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists finance_files_entity_idx on public.finance_files (tenant_id, entity_type, entity_id);
alter table public.finance_files enable row level security;

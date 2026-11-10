create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  kind text not null,
  storage_path text not null,
  file_name text,
  mime text,
  size_bytes bigint,
  valid_until date,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);
create index if not exists driver_documents_driver on public.driver_documents(driver_id, kind, created_at desc);
alter table public.driver_documents enable row level security;

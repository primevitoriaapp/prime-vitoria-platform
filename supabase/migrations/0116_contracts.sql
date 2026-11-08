create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  driver_id uuid references drivers(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  status text not null default 'pendente' check (status in ('pendente','assinado','recusado','cancelado')),
  file_path text,
  zapsign_token text,
  sign_url text,
  signers jsonb not null default '[]'::jsonb,
  signed_file_url text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  signed_at timestamptz,
  synced_at timestamptz,
  check ((driver_id is not null) <> (client_id is not null))
);
create index if not exists contracts_driver on public.contracts(driver_id);
create index if not exists contracts_client on public.contracts(client_id);
alter table public.contracts enable row level security;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts','contracts', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;

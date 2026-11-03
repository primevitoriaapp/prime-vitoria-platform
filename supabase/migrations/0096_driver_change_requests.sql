-- Motorista pede alteração de veículo, CNH ou PIX pelo app; a central aprova.
create table if not exists public.driver_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  kind text not null check (kind in ('vehicle','cnh','pix')),
  payload jsonb not null default '{}'::jsonb,
  file_path text,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.driver_change_requests enable row level security;
create index if not exists driver_change_requests_pending_idx on public.driver_change_requests (tenant_id, status, created_at desc);
create index if not exists driver_change_requests_driver_idx on public.driver_change_requests (driver_id, created_at desc);
insert into storage.buckets (id, name, public) values ('driver-docs', 'driver-docs', false) on conflict (id) do nothing;

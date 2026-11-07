create table if not exists public.driver_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  body text not null,
  contact_hint text,
  ask_interest boolean not null default true,
  target_category_ids uuid[],
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true
);
create table if not exists public.driver_message_receipts (
  message_id uuid not null references driver_messages(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  read_at timestamptz,
  answer text check (answer in ('interessado','indisponivel')),
  answered_at timestamptz,
  primary key (message_id, driver_id)
);
create index if not exists driver_messages_tenant_created on public.driver_messages(tenant_id, created_at desc);
alter table public.driver_messages enable row level security;
alter table public.driver_message_receipts enable row level security;

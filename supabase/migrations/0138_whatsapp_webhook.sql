-- Canal do WhatsApp (Dualhook/Cloud API): endereço secreto do webhook e token de verificação da Meta.
create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null default 'dualhook',
  label text,
  path_token text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  verify_token text not null default replace(gen_random_uuid()::text,'-',''),
  active boolean not null default true,
  verified_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now()
);
-- Tudo que a Meta envia (mensagens recebidas, status de entrega, ecos do app) fica guardado aqui.
create table if not exists public.whatsapp_inbound_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel_id uuid references public.whatsapp_channels(id) on delete set null,
  kind text,
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);
create index if not exists whatsapp_inbound_events_tenant_idx on public.whatsapp_inbound_events (tenant_id, received_at desc);
alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_inbound_events enable row level security;

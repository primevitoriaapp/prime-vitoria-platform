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

-- Conversas do WhatsApp da central (normalizadas a partir dos eventos).
create table if not exists public.whatsapp_contacts (
  tenant_id uuid not null,
  wa_id text not null,
  name text,
  profile_name text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_preview text,
  unread int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, wa_id)
);
create table if not exists public.whatsapp_chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  wa_id text not null,
  wa_message_id text,
  direction text not null check (direction in ('in','out')),
  source text not null default 'cliente',
  type text,
  body text,
  media_id text,
  status text,
  error text,
  sent_by uuid,
  ts timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists whatsapp_chat_messages_wamid on public.whatsapp_chat_messages (tenant_id, wa_message_id) where wa_message_id is not null;
create index if not exists whatsapp_chat_messages_thread on public.whatsapp_chat_messages (tenant_id, wa_id, ts desc);
create index if not exists whatsapp_contacts_recent on public.whatsapp_contacts (tenant_id, last_message_at desc nulls last);
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_chat_messages enable row level security;

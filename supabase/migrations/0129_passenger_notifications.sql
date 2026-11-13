-- Avisos automáticos ao passageiro pelo WhatsApp oficial (motorista confirmado, a caminho, avaliação).
create table if not exists public.passenger_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('confirmado','a_caminho','avaliacao')),
  phone text not null,
  person_name text,
  status text not null check (status in ('enviada','simulada','falhou','pulada')),
  detail text,
  preview text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (trip_id, kind, phone)
);
create index if not exists passenger_notifications_phone_kind on public.passenger_notifications (tenant_id, phone, kind, created_at desc);
alter table public.passenger_notifications enable row level security;
alter table public.clients add column if not exists notify_passengers boolean not null default true;

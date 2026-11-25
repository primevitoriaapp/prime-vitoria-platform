-- Avisos de WhatsApp ao motorista (nova corrida, alterada, cancelada/retirada).
create table if not exists public.driver_whatsapp_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  trip_id uuid not null,
  driver_id uuid not null,
  kind text not null check (kind in ('motorista_nova','motorista_alterada','motorista_cancelada')),
  phone text,
  status text not null default 'processando', -- enviada | simulada | pulada | falhou | processando
  detail text,
  preview text,
  provider_message_id text,
  created_at timestamptz not null default now()
);
create index if not exists driver_whatsapp_notices_trip_idx on public.driver_whatsapp_notices (trip_id, driver_id, kind, created_at desc);
create index if not exists driver_whatsapp_notices_tenant_idx on public.driver_whatsapp_notices (tenant_id, created_at desc);
alter table public.driver_whatsapp_notices enable row level security;
-- Trava contra aviso duplicado quando dois fluxos disparam juntos (nova / cancelada: 1 por corrida e motorista).
create unique index if not exists driver_whatsapp_notices_once_idx
  on public.driver_whatsapp_notices (trip_id, driver_id, kind)
  where kind <> 'motorista_alterada' and status in ('processando','enviada','simulada');

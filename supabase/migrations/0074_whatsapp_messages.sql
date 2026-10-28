-- Fila e histórico das mensagens de WhatsApp por corrida (automáticas ou com 1 clique).
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  trip_id uuid references public.trips (id) on delete cascade,
  event text not null,
  audience text not null check (audience in ('passageiro', 'solicitante', 'motorista', 'operador')),
  recipient_name text,
  phone text,
  body text not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviada', 'falhou', 'ignorada')),
  provider_message_id text,
  error text,
  sent_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists uq_whatsapp_messages_trip_event_audience
  on public.whatsapp_messages (trip_id, event, audience);
create index if not exists idx_whatsapp_messages_tenant_created on public.whatsapp_messages (tenant_id, created_at desc);
create index if not exists idx_whatsapp_messages_status on public.whatsapp_messages (tenant_id, status);

alter table public.whatsapp_messages enable row level security;
create policy whatsapp_messages_staff on public.whatsapp_messages
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = whatsapp_messages.tenant_id and p.role in ('admin', 'operador')
    )
  );

alter publication supabase_realtime add table public.whatsapp_messages;

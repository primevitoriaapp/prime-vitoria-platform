-- Textos de WhatsApp editáveis por evento e destinatário.
-- client_id preenchido = exceção daquele cliente. Aplicada em 28/10/2026.

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  event text not null,
  audience text not null check (audience in ('passageiro', 'solicitante', 'motorista', 'operador')),
  body text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists message_templates_scope_uniq
  on public.message_templates (tenant_id, event, audience, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.message_templates enable row level security;

create policy message_templates_tenant_rw on public.message_templates
for all
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.tenant_id = message_templates.tenant_id and p.role in ('admin', 'operador'))
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.tenant_id = message_templates.tenant_id and p.role in ('admin', 'operador'))
);

notify pgrst, 'reload schema';

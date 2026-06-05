-- Funcionários / passageiros frequentes por cliente PJ.

create table if not exists public.client_passengers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  phone text,
  address text,
  matricula text,
  sector text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_passengers_client on public.client_passengers (client_id);
create index if not exists idx_client_passengers_tenant on public.client_passengers (tenant_id);

comment on table public.client_passengers is 'Funcionários / passageiros frequentes de clientes PJ';

alter table public.client_passengers enable row level security;

create policy client_passengers_tenant_read on public.client_passengers
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = client_passengers.tenant_id
        and p.role in ('admin', 'operador', 'financeiro', 'cliente')
    )
  );

create policy client_passengers_tenant_write on public.client_passengers
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = client_passengers.tenant_id
        and p.role in ('admin', 'operador')
    )
  );

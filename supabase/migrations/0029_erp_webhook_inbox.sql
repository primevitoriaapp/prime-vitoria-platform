-- Caixa de entrada para webhooks ERP (processamento assíncrono futuro).

create table if not exists erp_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  provider text not null check (provider in ('omie', 'conta_azul', 'generic')),
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_erp_webhook_inbox_tenant_received
  on erp_webhook_inbox (tenant_id, received_at desc);

alter table erp_webhook_inbox enable row level security;

drop policy if exists erp_webhook_inbox_finance_read on erp_webhook_inbox;
create policy erp_webhook_inbox_finance_read on erp_webhook_inbox
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = erp_webhook_inbox.tenant_id
      and p.role in ('admin', 'financeiro')
  )
);

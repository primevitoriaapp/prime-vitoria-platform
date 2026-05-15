-- Configuração de automação de despacho por tenant (oferta automática após aprovação, limites).

create table if not exists dispatch_automation_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  auto_offer_on_approve boolean not null default false,
  offer_expires_seconds int not null default 180
    check (offer_expires_seconds >= 30 and offer_expires_seconds <= 3600),
  max_offer_candidates int not null default 8
    check (max_offer_candidates >= 1 and max_offer_candidates <= 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create index if not exists idx_dispatch_automation_settings_updated
  on dispatch_automation_settings (updated_at desc);

alter table dispatch_automation_settings enable row level security;

insert into dispatch_automation_settings (tenant_id, auto_offer_on_approve, offer_expires_seconds, max_offer_candidates)
values ('a0000000-0000-0000-0000-000000000001', false, 180, 8)
on conflict (tenant_id) do nothing;

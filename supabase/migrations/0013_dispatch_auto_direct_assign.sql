-- Despacho direto automático após aprovação (primeiro motorista sem conflito de agenda).
-- Exclusivo da oferta automática na aplicação (PUT /api/tenant/dispatch-settings valida).

alter table dispatch_automation_settings
  add column if not exists auto_direct_assign_on_approve boolean not null default false;

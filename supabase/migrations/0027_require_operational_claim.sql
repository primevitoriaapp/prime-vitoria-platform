-- Multiatendimento: exigir reivindicação activa antes de acções de despacho/notas (por tenant).

alter table dispatch_automation_settings
  add column if not exists require_operational_claim boolean not null default false;

comment on column dispatch_automation_settings.require_operational_claim is
  'Se true, operador deve assumir atendimento (claim) antes de despacho manual, ofertas e notas internas.';

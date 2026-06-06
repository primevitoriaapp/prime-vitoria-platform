-- Solicitações de corrida no portal corporativo (por cliente).

alter table clients
  add column if not exists portal_requests_enabled boolean not null default false;

comment on column clients.portal_requests_enabled is
  'Quando true, utilizadores do portal corporativo podem solicitar e cancelar corridas.';

-- Prime Vitória (tenant legado): activar solicitações para todos os clientes activos.
update clients
set portal_requests_enabled = true
where tenant_id = 'a0000000-0000-0000-0000-000000000001'
  and active = true;

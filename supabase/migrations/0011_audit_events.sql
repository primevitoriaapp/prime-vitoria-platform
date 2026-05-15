-- Auditoria operacional (inserções via service role nas rotas Next).

create table audit_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants (id),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_tenant_time on audit_events (tenant_id, created_at desc);
create index if not exists idx_audit_events_entity on audit_events (entity_type, entity_id);
create index if not exists idx_audit_events_actor on audit_events (actor_user_id, created_at desc);

alter table audit_events enable row level security;

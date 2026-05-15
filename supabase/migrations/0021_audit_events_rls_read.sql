-- Leitura de auditoria por tenant (JWT Supabase). Escrita continua via service role nas rotas Next.

drop policy if exists audit_events_operational_read on audit_events;
create policy audit_events_operational_read on audit_events
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = audit_events.tenant_id
      and p.role in ('admin', 'operador', 'financeiro')
  )
);

drop policy if exists audit_events_client_own_trips on audit_events;
create policy audit_events_client_own_trips on audit_events
for select
using (
  audit_events.entity_type = 'trip'
  and exists (
    select 1 from profiles p
    join trips t on t.id::text = audit_events.entity_id
    where p.id = auth.uid()
      and p.role = 'cliente'
      and p.tenant_id = audit_events.tenant_id
      and t.client_id = p.client_id
      and t.tenant_id = p.tenant_id
  )
);

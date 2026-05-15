-- Leitura de auditoria alinhada ao tenant (JWT Supabase). Insercoes continuam via service role nas rotas Next.

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

comment on policy audit_events_operational_read on audit_events is 'admin/operador/financeiro leem apenas eventos do seu tenant.';

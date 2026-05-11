-- Mapeamentos ERP: leitura para operacao/financeiro; escrita apenas admin/operador.
-- Nota: rotas Next com service role ignoram RLS; politicas valem para clientes Supabase autenticados (RLS).

alter table erp_entity_mappings enable row level security;

create policy erp_entity_mappings_admin_operador_write on erp_entity_mappings
for all
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('admin', 'operador')
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('admin', 'operador')
  )
);

create policy erp_entity_mappings_financeiro_read on erp_entity_mappings
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'financeiro'
  )
);

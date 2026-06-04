-- Garante tenant_id em regras antigas (coluna adicionada manualmente em alguns ambientes).
update public.client_pricing_rules r
set tenant_id = c.tenant_id
from public.clients c
where r.client_id = c.id
  and (r.tenant_id is null or r.tenant_id is distinct from c.tenant_id);

alter table public.client_pricing_rules
  alter column tenant_id set not null;

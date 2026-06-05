-- Centros de custo com responsável e estado activo.

alter table public.cost_centers
  add column if not exists responsible_name text;

alter table public.cost_centers
  add column if not exists responsible_email text;

alter table public.cost_centers
  add column if not exists active boolean not null default true;

alter table public.cost_centers
  add column if not exists tenant_id uuid references public.tenants (id);

update public.cost_centers cc
set tenant_id = c.tenant_id
from public.clients c
where cc.client_id = c.id
  and cc.tenant_id is null;

comment on column public.cost_centers.responsible_name is 'Nome do responsável pelo centro de custo';
comment on column public.cost_centers.responsible_email is 'E-mail do responsável (filtro portal cliente)';

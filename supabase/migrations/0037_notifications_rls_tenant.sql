-- tenant_id + RLS: in-app por destinatário; fila por tenant (staff).

alter table notifications
  add column if not exists tenant_id uuid references tenants (id);

update notifications n
set tenant_id = j.tenant_id
from notification_jobs j
where j.id = n.job_id
  and n.tenant_id is null;

update notifications n
set tenant_id = p.tenant_id
from profiles p
where n.recipient_type = 'profile'
  and n.recipient_id = p.id::text
  and n.tenant_id is null;

update notifications
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table notifications alter column tenant_id set not null;

create index if not exists idx_notifications_tenant_created
  on notifications (tenant_id, created_at desc);

alter table notifications enable row level security;
alter table notification_jobs enable row level security;

drop policy if exists notifications_in_app_own_select on notifications;
create policy notifications_in_app_own_select on notifications
for select
using (
  channel = 'in_app'
  and recipient_type = 'profile'
  and recipient_id = auth.uid()::text
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
  )
);

drop policy if exists notifications_in_app_own_update on notifications;
create policy notifications_in_app_own_update on notifications
for update
using (
  channel = 'in_app'
  and recipient_type = 'profile'
  and recipient_id = auth.uid()::text
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
  )
)
with check (
  channel = 'in_app'
  and recipient_type = 'profile'
  and recipient_id = auth.uid()::text
);

drop policy if exists notification_jobs_tenant_staff_select on notification_jobs;
create policy notification_jobs_tenant_staff_select on notification_jobs
for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = notification_jobs.tenant_id
      and p.role in ('admin', 'operador')
  )
);

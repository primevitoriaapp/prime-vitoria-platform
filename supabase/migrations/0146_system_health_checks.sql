-- Checagem diária do sistema (Degrau 3): resultado de cada rodada e falhas do agendador.
create table if not exists public.system_health_checks (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ran_at timestamptz not null default now(),
  trigger text not null default 'cron',
  problems int not null default 0,
  critical int not null default 0,
  items jsonb not null default '[]'::jsonb,
  notified jsonb not null default '{}'::jsonb
);
create index if not exists system_health_checks_tenant_ran on public.system_health_checks (tenant_id, ran_at desc);
alter table public.system_health_checks enable row level security;

-- Falhas das tarefas agendadas (pg_cron) e das chamadas que elas fazem (pg_net). Só o servidor usa.
create or replace function public.health_scheduler_failures(p_hours int default 24)
returns table (source text, failures bigint, last_message text)
language sql
security definer
set search_path = public, cron, net
as $$
  select 'agendador'::text, count(*), max(left(coalesce(return_message, ''), 200))
    from cron.job_run_details
   where status = 'failed' and start_time > now() - make_interval(hours => p_hours)
  union all
  select 'chamadas'::text, count(*), max(left(coalesce(error_msg, status_code::text), 200))
    from net._http_response
   where created > now() - make_interval(hours => p_hours)
     and (error_msg is not null or status_code >= 400);
$$;
revoke all on function public.health_scheduler_failures(int) from public, anon, authenticated;
grant execute on function public.health_scheduler_failures(int) to service_role;

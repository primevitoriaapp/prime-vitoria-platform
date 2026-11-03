-- Liga a proteção (RLS) nas tabelas que o Supabase apontou como públicas.
-- O sistema usa a chave de servidor (service role), que ignora RLS, então nada para.
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.erp_connections enable row level security;
alter table public.trip_financials enable row level security;
alter table public.driver_vehicle_links enable row level security;
alter table public.dispatch_offer_recipients enable row level security;
alter table public.cost_centers enable row level security;
alter table public.requesters enable row level security;
alter table public.client_units enable row level security;
alter table public.client_departments enable row level security;

-- Cada usuário logado lê só o próprio perfil (as regras das outras tabelas dependem disso).
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());

-- Cópia de segurança de hoje também fica trancada.
do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'backup_20261103' and c.relkind = 'r' loop
    execute format('alter table backup_20261103.%I enable row level security', r.relname);
  end loop;
end $$;

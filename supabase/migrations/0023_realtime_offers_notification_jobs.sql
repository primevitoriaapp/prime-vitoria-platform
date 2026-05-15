-- Realtime: ofertas de despacho e fila de notificacoes por tenant.

alter table dispatch_offers replica identity full;
alter table notification_jobs replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dispatch_offers'
  ) then
    alter publication supabase_realtime add table public.dispatch_offers;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_jobs'
  ) then
    alter publication supabase_realtime add table public.notification_jobs;
  end if;
end
$$;

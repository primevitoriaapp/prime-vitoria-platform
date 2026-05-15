-- Realtime para painel de webhooks ERP no financeiro.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'erp_webhook_inbox'
  ) then
    alter publication supabase_realtime add table public.erp_webhook_inbox;
  end if;
end $$;

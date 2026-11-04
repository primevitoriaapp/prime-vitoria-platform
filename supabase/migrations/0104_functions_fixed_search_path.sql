-- Aviso de segurança do Supabase (function_search_path_mutable): fixa o search_path das funções de gatilho.
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('log_trip_status_change','calc_trip_margin','set_trip_status_audit_context') loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

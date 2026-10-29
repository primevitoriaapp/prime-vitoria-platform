do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid='public.trips'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%km_source%';
  if c is not null then execute format('alter table public.trips drop constraint %I', c); end if;
end $$;
alter table public.trips add constraint trips_km_source_check check (km_source in ('coords','gps_trail','manual','odometer'));

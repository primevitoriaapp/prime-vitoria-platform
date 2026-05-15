-- Contexto de auditoria para transições de estado (motorista vs operação).

create or replace function set_trip_status_audit_context(p_source text, p_changed_by uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('app.trip_status_source', coalesce(p_source, 'system'), true);
  perform set_config('app.trip_status_changed_by', coalesce(p_changed_by::text, ''), true);
end;
$$;

create or replace function log_trip_status_change()
returns trigger
language plpgsql
as $$
declare
  v_source text;
  v_changed_by uuid;
begin
  v_source := coalesce(nullif(current_setting('app.trip_status_source', true), ''), 'system');
  v_changed_by := nullif(current_setting('app.trip_status_changed_by', true), '')::uuid;

  if tg_op = 'INSERT' then
    insert into trip_status_history (trip_id, from_status, to_status, changed_by, source, note)
    values (new.id, null, new.operational_status, coalesce(v_changed_by, new.created_by), v_source, 'Trip criada');
    return new;
  end if;

  if new.operational_status is distinct from old.operational_status then
    insert into trip_status_history (trip_id, from_status, to_status, changed_by, source, note)
    values (
      new.id,
      old.operational_status,
      new.operational_status,
      coalesce(v_changed_by, new.approved_by, old.approved_by),
      v_source,
      null
    );
  end if;

  return new;
end;
$$;

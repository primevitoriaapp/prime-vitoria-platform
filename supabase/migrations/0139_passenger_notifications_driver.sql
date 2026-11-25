-- Guarda o motorista de cada aviso: passageiro recorrente só recebe "motorista confirmado" quando o motorista muda.
alter table public.passenger_notifications add column if not exists driver_id uuid;
create index if not exists passenger_notifications_phone_kind on public.passenger_notifications (tenant_id, phone, kind, created_at desc);

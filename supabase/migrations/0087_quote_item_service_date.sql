-- Data do serviço guardada mesmo sem a hora definida (horário a combinar).
alter table public.quote_items add column if not exists service_date date;
update public.quote_items set service_date = (scheduled_at at time zone 'America/Sao_Paulo')::date where scheduled_at is not null and service_date is null;

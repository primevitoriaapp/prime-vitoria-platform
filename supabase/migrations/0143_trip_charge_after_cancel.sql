-- Corrida cancelada ou no-show que mesmo assim é cobrada do cliente (taxa de no-show / cancelamento em cima da hora).
alter table public.trips add column if not exists charge_after_cancel boolean not null default false;
alter table public.trips add column if not exists charge_reason text check (charge_reason in ('no_show','cancelamento_tardio','outro'));
create index if not exists trips_charge_after_cancel_idx on public.trips (tenant_id) where charge_after_cancel;

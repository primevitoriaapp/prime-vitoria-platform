-- Espera: tolerância padrão 10 min; a central decide cobrar ou não do cliente.
alter table public.trips add column if not exists wait_client_waived boolean not null default false;
alter table public.clients alter column wait_tolerance_minutes set default 10;
update public.clients set wait_tolerance_minutes = 10 where wait_tolerance_minutes = 15;

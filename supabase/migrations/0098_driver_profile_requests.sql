-- Motorista também pede alteração dos dados pessoais e da foto (a central aprova).
alter table public.driver_change_requests drop constraint if exists driver_change_requests_kind_check;
alter table public.driver_change_requests add constraint driver_change_requests_kind_check check (kind in ('vehicle','cnh','pix','profile','photo'));

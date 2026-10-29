alter table public.quote_items add column if not exists hours numeric(4,1);
alter table public.quote_items drop constraint if exists quote_items_service_mode_check;
alter table public.quote_items add constraint quote_items_service_mode_check check (service_mode in ('transfer','diaria','diaria_5h','diaria_10h','diaria_12h','km','outro'));
alter table public.quotes add column if not exists share_token text unique, add column if not exists sent_at timestamptz, add column if not exists sent_to text;

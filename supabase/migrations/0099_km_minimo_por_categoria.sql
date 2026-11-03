-- KM mínimo por veículo na tabela da empresa (client_price = mínimo do cliente; partner_price = mínimo do parceiro).
alter table public.client_category_prices drop constraint if exists client_category_prices_service_check;
alter table public.client_category_prices add constraint client_category_prices_service_check check (service = any (array['transfer','diaria_5h','diaria_10h','diaria_12h','km_b1','km_b2','km_minimo','hora_extra','hora_parada']));

-- Previsão de pagamento do motorista e lista de passageiros por empresa (definidos por Rubens em 03/11/2026).
alter table public.clients
  add column if not exists reconciliation_business_days smallint not null default 0,
  add column if not exists requires_passenger_list boolean not null default false;

alter table public.clients drop constraint if exists clients_reconciliation_business_days_check;
alter table public.clients add constraint clients_reconciliation_business_days_check check (reconciliation_business_days between 0 and 15);

comment on column public.clients.reconciliation_business_days is 'Dias úteis entre o vencimento e o dinheiro conciliado no banco (PIX 0, boleto ~2). Soma na data de pagamento do motorista.';
comment on column public.clients.requires_passenger_list is 'Motorista informa no embarque quem veio; cada passageiro vira uma parada de desembarque.';

notify pgrst, 'reload schema';

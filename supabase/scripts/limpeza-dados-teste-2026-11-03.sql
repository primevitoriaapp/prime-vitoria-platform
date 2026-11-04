-- LIMPEZA DOS DADOS DE TESTE — Prime Vitória (03/11/2026)
-- Regra do Rubens: tudo que entrou a partir de 03/11/2026 00h (Brasília) FICA. O resto (teste) sai.
-- Tudo dentro de uma transação: se qualquer linha der erro, nada é apagado.
-- Cópia de segurança das corridas e do financeiro já existe no schema backup_20261103.

begin;

create temp table corte as select timestamptz '2026-11-03 03:00:00+00' as c;

-- Corridas de teste: criadas E marcadas antes de hoje.
create temp table del_trips as
  select t.id from public.trips t, corte where t.created_at < corte.c and t.scheduled_at < corte.c;

-- Corridas que ficam e apontavam para uma corrida apagada (ida/volta): solta o vínculo.
update public.trips set trip_id_return = null where trip_id_return in (select id from del_trips);

-- Financeiro ligado às corridas de teste (ou criado antes de hoje sem corrida).
delete from public.driver_payables
  where trip_id in (select id from del_trips) or (trip_id is null and created_at < (select c from corte));
delete from public.accounts_receivable
  where trip_id in (select id from del_trips) or (trip_id is null and created_at < (select c from corte));

-- Faturas de teste (criadas antes de hoje).
update public.trips set client_invoice_id = null
  where client_invoice_id in (select id from public.client_invoices where created_at < (select c from corte));
delete from public.client_invoices where created_at < (select c from corte);

-- GPS das corridas de teste e posições soltas antigas.
delete from public.driver_locations
  where trip_id in (select id from del_trips) or (trip_id is null and recorded_at < (select c from corte));

-- As corridas (histórico, avaliações, assinaturas, ofertas etc. saem junto, em cascata).
delete from public.trips where id in (select id from del_trips);

-- Contas a pagar lançadas antes de hoje (inclui "Mensalidade da Contabilidade R$ 840" e "Mensalidade Makes").
-- >>> Se alguma delas for conta REAL, apague a linha abaixo antes de rodar e me avise. <<<
delete from public.company_payables where created_at < (select c from corte);

-- Orçamentos de teste (antes de hoje). O da COES de hoje fica.
delete from public.quote_items where quote_id in (select id from public.quotes where created_at < (select c from corte));
delete from public.quotes where created_at < (select c from corte);

-- Notificações antigas (o sino com dezenas de avisos de teste).
delete from public.notifications where created_at < (select c from corte);

-- Clientes e motoristas de teste: desativados (somem das listas; nada quebra).
update public.clients set active = false
  where id in ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');
update public.drivers set active = false
  where id in ('faa49ed4-a284-4212-86aa-e366e04298dc', 'bdb90db1-3780-4f10-a63f-6d091f454de3');

commit;

-- Conferência (deve mostrar 24 corridas, 1 conta a receber e 1 repasse — os da corrida da Comexport de hoje).
select
  (select count(*) from public.trips) as corridas,
  (select count(*) from public.accounts_receivable) as contas_a_receber,
  (select count(*) from public.driver_payables) as repasses,
  (select count(*) from public.client_invoices) as faturas,
  (select count(*) from public.company_payables) as contas_a_pagar;

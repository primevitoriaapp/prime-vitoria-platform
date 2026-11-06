-- Juntar serviços na fatura: corridas com a mesma chave viram um item só para o cliente (ex.: "NR263701-E").
alter table public.trips add column if not exists invoice_merge_key text;

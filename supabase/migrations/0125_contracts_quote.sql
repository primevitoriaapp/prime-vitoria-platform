-- Contrato ligado ao orçamento (pessoa física / casamento): assinou → orçamento aprovado → corridas na agenda.
alter table public.contracts add column if not exists quote_id uuid references public.quotes(id) on delete set null;
alter table public.contracts drop constraint if exists contracts_check;
alter table public.contracts add constraint contracts_party_check check (driver_id is not null or client_id is not null or quote_id is not null);
create index if not exists contracts_quote on public.contracts(quote_id);

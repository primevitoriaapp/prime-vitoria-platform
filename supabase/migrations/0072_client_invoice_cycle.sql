-- Ciclo de fechamento da fatura por cliente (mês cheio ou dia fixo) e fechamento automático.
alter table public.clients
  add column if not exists invoice_closing_day smallint not null default 0,
  add column if not exists invoice_auto_close boolean not null default true;
alter table public.clients drop constraint if exists clients_invoice_closing_day_check;
alter table public.clients add constraint clients_invoice_closing_day_check check (invoice_closing_day between 0 and 28);
comment on column public.clients.invoice_closing_day is 'Dia em que a fatura fecha (1-28). 0 = mês cheio, do dia 1 ao último dia.';
comment on column public.clients.invoice_auto_close is 'Fecha a fatura automaticamente no dia seguinte ao fechamento.';

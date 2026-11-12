-- Compensação bancária padrão: 2 dias úteis depois do vencimento da fatura para liberar o repasse do motorista.
alter table public.clients alter column reconciliation_business_days set default 2;
update public.clients set reconciliation_business_days = 2 where coalesce(reconciliation_business_days, 0) < 2;

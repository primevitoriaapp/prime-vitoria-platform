-- Regras de cobrança por cliente (definidas por Rubens em 28/10/2026):
-- hora parada com tolerância, valor cobrado do cliente e pago ao parceiro,
-- prazo de pagamento e CNPJ emitente. Só adiciona colunas.

alter table public.clients
  add column if not exists wait_tolerance_minutes int not null default 15,
  add column if not exists wait_client_price_per_hour numeric(12, 2),
  add column if not exists wait_driver_price_per_hour numeric(12, 2),
  add column if not exists payment_term_days int,
  add column if not exists billing_issuer text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_billing_issuer_check'
  ) then
    alter table public.clients
      add constraint clients_billing_issuer_check
      check (billing_issuer is null or billing_issuer in ('rj_prime', 'prime_servicos', 'ilha_prime'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'clients_payment_term_days_check'
  ) then
    alter table public.clients
      add constraint clients_payment_term_days_check
      check (payment_term_days is null or (payment_term_days >= 0 and payment_term_days <= 180));
  end if;
end $$;

comment on column public.clients.wait_tolerance_minutes is 'Minutos de espera sem cobrança (padrão 15).';
comment on column public.clients.wait_client_price_per_hour is 'Hora parada cobrada do cliente (R$/h), proporcional ao tempo.';
comment on column public.clients.wait_driver_price_per_hour is 'Hora parada paga ao parceiro (R$/h), proporcional ao tempo.';
comment on column public.clients.payment_term_days is 'Prazo de pagamento do cliente em dias (0 = à vista).';
comment on column public.clients.billing_issuer is 'CNPJ da Prime que fatura este cliente: rj_prime, prime_servicos, ilha_prime.';

notify pgrst, 'reload schema';

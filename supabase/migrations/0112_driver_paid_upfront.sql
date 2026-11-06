-- Motorista que só trabalha à vista: repasse liberado logo depois da corrida, sem esperar o cliente pagar.
alter table public.drivers add column if not exists paid_upfront boolean not null default false;

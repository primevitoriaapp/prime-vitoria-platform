-- CPF do funcionário cadastrado pelo gestor (identificação no embarque e no acesso ao portal).
alter table public.client_passengers add column if not exists cpf text;
comment on column public.client_passengers.cpf is 'CPF do funcionário (só números), cadastrado pelo gestor da conta.';

-- Já aplicado em produção (05/11/2026). Todo cliente novo é faturado pela Prime Locadora & Serviços, salvo escolha diferente.
alter table public.clients alter column billing_issuer set default 'prime_servicos';
update public.clients set billing_issuer = 'prime_servicos' where billing_issuer is null;

-- Assinatura no fim da corrida só para empresas que exigem (padrão: não pede).
alter table public.clients add column if not exists requires_signature boolean not null default false;

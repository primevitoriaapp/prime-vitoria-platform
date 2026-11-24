-- Limite de tentativas de PIN por código do QR (bloqueia após 5 erros) e qual loja validou.
alter table public.club_tokens add column if not exists attempts int not null default 0;
alter table public.club_tokens add column if not exists partner_id uuid references public.club_partners(id) on delete set null;

-- Portal do cliente: gestor da conta x funcionário solicitante.
-- gestor: vê todas as corridas da empresa, cadastra a equipe e dá acesso ao portal.
-- solicitante: funcionário com login próprio; pede corridas (vão direto para a Prime)
--              e vê só as corridas que ele mesmo pediu.

alter table public.profiles
  add column if not exists client_access text not null default 'gestor';

alter table public.profiles
  drop constraint if exists profiles_client_access_check;
alter table public.profiles
  add constraint profiles_client_access_check check (client_access in ('gestor', 'solicitante'));

comment on column public.profiles.client_access is
  'Portal do cliente: gestor (conta toda) ou solicitante (só as próprias corridas).';

alter table public.client_passengers
  add column if not exists email text,
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create index if not exists idx_client_passengers_profile on public.client_passengers (profile_id);
create index if not exists idx_trips_created_by on public.trips (created_by);

-- Cadastro operacional de motorista sem login/perfil (P1).

alter table drivers
  add column if not exists full_name text;

alter table drivers
  alter column profile_id drop not null;

comment on column drivers.full_name is 'Nome operacional; usado quando profile_id ainda não foi criado.';

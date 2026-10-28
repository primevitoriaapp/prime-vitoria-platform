-- Vínculo do motorista: funcionário (salário, não vê valores no app)
-- ou parceiro (terceirizado/agregado, vê só o próprio repasse).
-- Só adiciona coluna; motoristas já cadastrados ficam como parceiro.

alter table public.drivers
  add column if not exists employment_type text not null default 'parceiro';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_employment_type_check') then
    alter table public.drivers
      add constraint drivers_employment_type_check
      check (employment_type in ('funcionario', 'parceiro'));
  end if;
end $$;

comment on column public.drivers.employment_type is
  'funcionario = recebe salário, não vê valores no app; parceiro = terceirizado/agregado, vê só o próprio repasse.';

notify pgrst, 'reload schema';

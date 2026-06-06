-- Login simplificado para motoristas: CPF + PIN de 4 dígitos em /driver/login.

alter table drivers
  add column if not exists pin_hash text,
  add column if not exists pin_set_at timestamptz;

comment on column drivers.pin_hash is 'Hash scrypt do PIN de 4 dígitos; definido pelo admin na ficha do motorista.';
comment on column drivers.pin_set_at is 'Momento da última definição ou alteração do PIN.';

create index if not exists idx_drivers_pin_lookup
  on drivers (tenant_id, active)
  where pin_hash is not null;

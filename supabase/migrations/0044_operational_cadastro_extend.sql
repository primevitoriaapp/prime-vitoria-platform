-- Campos operacionais para cadastro MVP (aditivo, sem apagar dados).

alter table clients
  add column if not exists trade_name text,
  add column if not exists whatsapp text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists notes text,
  add column if not exists registry_status text;

alter table drivers
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists operational_category text,
  add column if not exists service_region text,
  add column if not exists operational_notes text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text,
  add column if not exists bank_account text,
  add column if not exists bank_account_type text,
  add column if not exists payee_name text,
  add column if not exists payee_document text,
  add column if not exists available boolean not null default true;

alter table vehicles
  add column if not exists brand text,
  add column if not exists model_year int,
  add column if not exists notes text;

alter table driver_vehicle_links
  add column if not exists is_default boolean not null default false;

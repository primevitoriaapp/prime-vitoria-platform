-- Tipos de serviço utilizados pelo cliente PJ (aditivo P1).

alter table clients
  add column if not exists service_types text[] not null default '{}';

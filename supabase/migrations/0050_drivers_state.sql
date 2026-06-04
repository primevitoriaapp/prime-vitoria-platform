-- UF do endereço na ficha do motorista (coluna ausente no staging linked).

alter table drivers
  add column if not exists state text;

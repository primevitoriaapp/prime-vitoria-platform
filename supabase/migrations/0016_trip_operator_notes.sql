-- Notas entre operadores sobre uma viagem (continuidade / multiatendimento). Acesso via service role nas rotas Next.

create table if not exists trip_operator_notes (
  id bigserial primary key,
  tenant_id uuid not null references tenants (id) on delete cascade,
  trip_id uuid not null references trips (id) on delete cascade,
  author_profile_id uuid not null references profiles (id),
  body text not null,
  created_at timestamptz not null default now(),
  constraint trip_operator_notes_body_len check (char_length(trim(body)) > 0 and char_length(body) <= 4000)
);

create index if not exists idx_trip_operator_notes_trip_time
  on trip_operator_notes (trip_id, created_at desc);

create index if not exists idx_trip_operator_notes_tenant_time
  on trip_operator_notes (tenant_id, created_at desc);

alter table trip_operator_notes enable row level security;

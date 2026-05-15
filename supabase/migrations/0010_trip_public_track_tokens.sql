-- Link público de acompanhamento (token opaco; leitura via service role na app).

create table trip_public_track_tokens (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trip_public_track_tokens_trip on trip_public_track_tokens (trip_id);
create index if not exists idx_trip_public_track_tokens_exp on trip_public_track_tokens (expires_at);

alter table trip_public_track_tokens enable row level security;

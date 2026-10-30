alter table public.trips add column if not exists review_required boolean not null default false, add column if not exists review_reason text, add column if not exists reviewed_at timestamptz;
create index if not exists trips_review_idx on public.trips (tenant_id) where review_required;

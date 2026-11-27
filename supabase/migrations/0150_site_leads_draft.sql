alter table public.site_leads add column if not exists draft_data jsonb, add column if not exists draft_step smallint, add column if not exists draft_at timestamptz;

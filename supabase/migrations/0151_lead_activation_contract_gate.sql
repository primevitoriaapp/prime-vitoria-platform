alter table public.site_leads add column if not exists driver_id uuid references public.drivers(id) on delete set null, add column if not exists decision_reason text, add column if not exists decided_at timestamptz;
alter table public.drivers add column if not exists contract_required boolean not null default false;

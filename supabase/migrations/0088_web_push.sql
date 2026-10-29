create table if not exists public.app_secrets (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  profile_id uuid,
  driver_id uuid,
  role text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_error text
);
alter table public.push_subscriptions enable row level security;
create index if not exists push_subscriptions_driver_idx on public.push_subscriptions (driver_id);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

update public.notification_jobs set status = 'error', last_error = 'EXPIRADO_SEM_PROCESSAR', updated_at = now()
where status = 'queued' and created_at < now() - interval '12 hours';

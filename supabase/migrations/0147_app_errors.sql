-- Erros de tela (navegador) e do servidor, para a checagem diária.
create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('tela','servidor')),
  path text,
  code text,
  message text not null,
  digest text,
  user_agent text,
  role text
);
create index if not exists app_errors_created on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;

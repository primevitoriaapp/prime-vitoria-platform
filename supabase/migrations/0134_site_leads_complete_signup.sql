alter table public.site_leads
  add column if not exists complete_token text unique,
  add column if not exists complete_data jsonb,
  add column if not exists complete_files jsonb not null default '{}'::jsonb,
  add column if not exists complete_sent_at timestamptz,
  add column if not exists completed_at timestamptz;
comment on column public.site_leads.complete_token is 'Link único do cadastro completo do motorista (etapa 2), enviado pela central.';

-- Minha empresa: identidade, contatos e e-mails do sistema editáveis pelo painel.
alter table public.tenant_company_profiles
  add column if not exists tagline text,
  add column if not exists whatsapp text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists email_sender_name text,
  add column if not exists email_reply_to text,
  add column if not exists email_finance text;

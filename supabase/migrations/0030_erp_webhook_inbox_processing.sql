-- Estado de processamento para webhooks ERP inbound.

alter table erp_webhook_inbox
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'processed', 'ignored', 'error')),
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists attempt_count int not null default 0;

create index if not exists idx_erp_webhook_inbox_pending
  on erp_webhook_inbox (received_at asc)
  where status = 'pending';

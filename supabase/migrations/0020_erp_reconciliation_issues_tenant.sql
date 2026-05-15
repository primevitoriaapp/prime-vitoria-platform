-- Issues de reconciliacao ERP: escopo por tenant (multiempresa).

alter table erp_reconciliation_issues
  add column if not exists tenant_id uuid references tenants (id);

update erp_reconciliation_issues
set tenant_id = 'a0000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table erp_reconciliation_issues alter column tenant_id set not null;

create index if not exists idx_erp_reconciliation_issues_tenant_status
  on erp_reconciliation_issues (tenant_id, status, created_at desc);

-- Evita duplicar o mesmo problema em aberto (cron repetido).
create unique index if not exists uq_erp_reconciliation_open_missing_receivable
  on erp_reconciliation_issues (tenant_id, provider, entity_id)
  where (status = 'open' and issue_type = 'missing_external' and entity_type = 'receivable');

comment on column erp_reconciliation_issues.tenant_id is 'Organizacao do mapeamento ERP associado ao titulo.';

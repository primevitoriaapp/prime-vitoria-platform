-- Um titulo a receber por viagem (upsert na API financeira).
create unique index if not exists uq_accounts_receivable_trip_id on accounts_receivable (trip_id);

-- Um pagavel por motorista por viagem.
create unique index if not exists uq_driver_payables_trip_driver on driver_payables (trip_id, driver_id);

-- Limpeza de jobs de notificacao por correlation_id (rollback de oferta).
create index if not exists idx_notification_jobs_correlation_id on notification_jobs (correlation_id);

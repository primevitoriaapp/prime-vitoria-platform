-- In-app: leitura por destinatário (perfil) + índice de listagem

alter table notifications
  add column if not exists read_at timestamptz;

create index if not exists idx_notifications_in_app_profile_created
  on notifications (recipient_id, created_at desc)
  where channel = 'in_app' and recipient_type = 'profile';

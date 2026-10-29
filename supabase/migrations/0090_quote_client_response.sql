alter table public.quotes add column if not exists client_response text, add column if not exists client_responded_at timestamptz;

-- Horários da linha do tempo corrigidos pela central (o que o cliente vê). Ex.: {"caminho":"2026-11-05T20:10:00Z"}
alter table public.trips add column if not exists timeline_overrides jsonb;

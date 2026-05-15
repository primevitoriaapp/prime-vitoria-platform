# Tracking publico de corrida

## Fluxo

1. Operador/cliente com acesso a viagem: `POST /api/trips/:id/tracking-token` (opcional `expires_in_hours`, default 168).
2. Resposta: `{ token, path: "/r/<token>", expires_at }` — gera auditoria `trip.tracking_token_create`.
3. Pagina publica `/r/<token>` — SSR inicial + polling a cada 15 s via `GET /api/public/track/<token>`.
4. API publica: sem JWT; rate limit 60 req/min por IP; token base64url 16–200 chars.

## Dados expostos (minimos)

- Estado operacional, origem, destino, passageiro (se houver), horario agendado.
- Ultima posicao GPS da corrida (`driver_locations`), se existir.
- Nao expoe IDs internos de cliente/motorista nem dados financeiros.

## Supabase

- Tabela `trip_public_track_tokens` (migracao `0010`).
- Leitura via service role nas rotas Next (RLS sem policy de leitura anonima).

## Staging

Ver checklist em `docs/STAGING_E2E.md` (item tracking).

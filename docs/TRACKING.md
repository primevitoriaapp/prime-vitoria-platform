# Tracking publico de corrida

## Fluxo

1. Operador/cliente com acesso a viagem: `POST /api/trips/:id/tracking-token` (opcional `expires_in_hours`, default 168).
2. Resposta: `{ token, path: "/r/<token>", expires_at }` — gera auditoria `trip.tracking_token_create`.
3. Pagina publica `/r/<token>` — SSR inicial + stream SSE `GET /api/public/track/<token>/stream`; polling HTTP permanece como fallback.
4. API publica: sem JWT; rate limit 60 req/min por IP no snapshot e 20 streams/min por IP; token base64url 16–200 chars.

## Dados expostos (minimos)

- Estado operacional, origem, destino, passageiro (se houver), horario agendado.
- Ultima posicao GPS da corrida (`driver_locations`), se existir.
- `planned_km` / `actual_km` quando calculados (migracao `0025`; recalculo automatico ao concluir a corrida).
- Nao expoe IDs internos de cliente/motorista nem dados financeiros.

## Tempo real

- O stream público envia um snapshot inicial e só emite novo evento quando muda o cursor `operational_status | location.recorded_at | planned_km | actual_km | km_updated_at`.
- Cada conexão SSE dura até 55 s e o navegador reconecta automaticamente; se SSE falhar, o componente mantém polling adaptativo (12 s ativo, 45 s terminal).
- A leitura continua passando pela API Next com service role; o browser público não assina tabelas Supabase diretamente.

## Supabase

- Tabela `trip_public_track_tokens` (migracao `0010`).
- Leitura via service role nas rotas Next (RLS sem policy de leitura anonima).

## Staging

Ver checklist em `docs/STAGING_E2E.md` (item tracking).

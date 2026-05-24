# Observabilidade (prep MVP)

## Endpoints

| Endpoint | Uso |
|----------|-----|
| `GET /api/health` | Liveness (`ok`, Supabase, FCM flag) |
| `GET /api/health?detailed=1` | Dependências (pode 503 se parcial) |

## Logs operacionais

- Erros API: `mapApiError` em `src/lib/server/http.ts` — códigos estáveis (`FORBIDDEN`, `PRICING_FEATURE_DISABLED`, `INVALID_STATUS_TRANSITION`, …)
- Jobs: processors escrevem `last_error` em filas (`notification_jobs`, `erp_jobs`)
- Audit: `GET /api/audit-events` (admin/operador/financeiro)

## Sentry (opcional)

Variáveis: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build).

Sem DSN → app funciona; sem crash reporting remoto.

## Smoke / CI

- `npm run test:e2e-smoke` — health + rotas públicas
- `npm run test:night-preview-smoke` — suite completa staging
- Workflow `preview-pr-smoke.yml` — quando secrets GitHub configurados

## Próximo (fase 2)

- Request ID em `meta` das respostas API
- Métricas Vercel Analytics / Supabase advisors
- Alertas cron falhados

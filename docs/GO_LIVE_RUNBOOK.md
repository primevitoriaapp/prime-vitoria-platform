# Go-live Runbook - Prime Vitoria

## Checklist rápido

| # | Item | Comando / doc |
|---|------|----------------|
| 1 | Migrações Supabase (`0001`–`0038`) | `npm run db:push` |
| 2 | Variáveis Vercel + Supabase | `docs/VERCEL_DEPLOY.md`, `.env.example` |
| 3 | Preflight automatizado | `npm run go-live:preflight` |
| 4 | Deploy (Git push → Vercel) | `docs/VERCEL_DEPLOY.md` |
| 5 | Auth redirects `*.vercel.app` | Painel Supabase |
| 6 | Seed staging (opcional) | `npm run seed:staging` |
| 7 | Smoke todos os papéis | `npm run test:e2e-staging-all` |
| 8 | Crons (Pro ou GitHub Actions) | `docs/VERCEL_CRONS.md` |
| 9 | Uptime / readiness | `GET /api/health` e `GET /api/health?detailed=1` (503 se Supabase público em falta) |
| 10 | ERP live | `npm run erp:preflight` (+ `--http` contra preview) |
| 11 | Sentry (opcional) | `SENTRY_DSN` na Vercel — erros em `global-error` |

## Pre-go-live

- Confirmar variaveis `.env` completas. Os preflights locais carregam `.env.supabase.local`, `.env.vercel.local`, `.env.local` e `.env`, sem substituir valores ja definidos no shell. Em producao **nao** definir `TRUST_HEADER_AUTH` (ou deixar diferente de `true`): APIs exigem `Authorization: Bearer` JWT valido; cabecalhos `x-role` sao ignorados para sessao.
- Se precisar bootstrap emergencial por cabecalho em producao, definir `TRUST_HEADER_AUTH=true` por tempo limitado e revisar logs.
- Painel Next: fluxo em `/login` (Server Action + cookies); `middleware` usa `@supabase/ssr` + `getUser()` para papel da rota. Garantir `role` em `profiles` e/ou `user_metadata` / `app_metadata` alinhados ao RBAC.
- Aplicar todas as migracoes em `supabase/migrations` no Supabase (ordem numerica; inclui multiempresa, RLS, ERP, push tokens, auditoria).
- Validar RLS com usuarios reais (admin, operador, cliente, motorista, financeiro).
- Configurar integracao ERP conforme `docs/ERP_INTEGRATION.md` (testar primeiro em `mock`, depois `live`).
- Executar `npm run go-live:preflight` (testes unitários + smoke HTTP; com `STAGING_E2E_PASSWORD` também corre um papel de staging). Se o deployment estiver protegido pela Vercel, defina `VERCEL_AUTOMATION_BYPASS_SECRET`.
- Executar smoke tests de API (jobs: POST com Bearer do segredo correspondente ou JWT com role adequada; ver `docs/ERP_INTEGRATION.md`):
  - `/api/trips`
  - `/api/trips/:id/dispatch-directed`
  - `/api/dispatch/offers`
  - `/api/finance/trips/:id/generate`
  - `POST /api/jobs/notifications/process` (com `FCM_SERVER_KEY`; ver `docs/NOTIFICATIONS.md`)
  - `POST /api/drivers/push-token` (JWT motorista)
  - `POST /api/jobs/erp/process`
  - `POST /api/jobs/reconcile/run`

## Cutover

- Publicar frontend web.
- Configurar endpoint scheduler para:
  - `POST /api/jobs/notifications/process` a cada 1 minuto com `Authorization: Bearer <NOTIFICATION_JOB_PROCESS_SECRET>` (e `FCM_SERVER_KEY` definido para entrega FCM)
  - `POST /api/jobs/erp/process` a cada 1 minuto com `Authorization: Bearer <ERP_JOB_PROCESS_SECRET>`
  - `POST /api/jobs/reconcile/run` diariamente com `Authorization: Bearer <RECONCILE_JOB_PROCESS_SECRET>`
  - (Segredos em `.env`; ver `.env.example`. Operadores podem disparar manualmente com JWT em vez do Bearer.)
- Iniciar operacao com clientes piloto.

## Operacao assistida (primeiros 30 dias)

- Revisao diaria de filas pendentes.
- Revisao diaria de corridas sem despacho.
- Revisao diaria de divergencias ERP.
- Revisao semanal de margem por cliente/motorista.

## Incident playbook

- Falha de notificacao: reprocessar `notification_jobs`.
- Falha ERP: manter operacao interna e reprocessar `erp_sync_jobs`.
- Falha de despacho: usar fluxo direcionado manual.

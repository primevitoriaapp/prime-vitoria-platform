# Go-live Runbook - Prime Vitoria

## Pre-go-live

- Confirmar variaveis `.env` completas. Em producao **nao** definir `TRUST_HEADER_AUTH` (ou deixar diferente de `true`): APIs exigem `Authorization: Bearer` JWT valido; cabecalhos `x-role` sao ignorados para sessao.
- Se precisar bootstrap emergencial por cabecalho em producao, definir `TRUST_HEADER_AUTH=true` por tempo limitado e revisar logs.
- Painel Next: fluxo em `/login` (Server Action + cookies); `middleware` usa `@supabase/ssr` + `getUser()` para papel da rota. Garantir `role` em `profiles` e/ou `user_metadata` / `app_metadata` alinhados ao RBAC.
- Aplicar migracoes `0001` ate `0005` no Supabase (`0004`: RPC `create_dispatch_offer_with_recipients` para `POST /api/dispatch/offers`; `0005`: indices unicos financeiros + indice `notification_jobs.correlation_id`).
- Validar RLS com usuarios reais (admin, operador, cliente, motorista, financeiro).
- Configurar integracao ERP conforme `docs/ERP_INTEGRATION.md` (testar primeiro em `mock`, depois `live`).
- Executar smoke tests de API (jobs: POST com Bearer do segredo correspondente ou JWT com role adequada; ver `docs/ERP_INTEGRATION.md`):
  - `/api/trips`
  - `/api/trips/:id/dispatch-directed`
  - `/api/dispatch/offers`
  - `/api/finance/trips/:id/generate`
  - `POST /api/jobs/notifications/process`
  - `POST /api/jobs/erp/process`
  - `POST /api/jobs/reconcile/run`

## Cutover

- Publicar frontend web.
- Configurar endpoint scheduler para:
  - `POST /api/jobs/notifications/process` a cada 1 minuto com `Authorization: Bearer <NOTIFICATION_JOB_PROCESS_SECRET>`
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

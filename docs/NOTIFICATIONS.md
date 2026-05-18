# Notificacoes push (motorista)

## Fluxo

1. **PWA motorista** (`/driver`): com variaveis `NEXT_PUBLIC_FIREBASE_*` + `NEXT_PUBLIC_FCM_VAPID_KEY`, o componente `DriverPushRegister` pede permissao e chama `POST /api/drivers/push-token`. Sem Firebase, o motorista pode colar o token FCM manualmente (staging).
2. Operacao enfileira `notification_jobs` com `recipientType: "driver"`, `recipientId` = UUID do motorista e `tenant_id` da organizacao.
3. Monitoramento: `GET /api/jobs/notifications?status=queued` (operador/admin, tenant da sessao).
4. Worker/cron: `POST /api/jobs/notifications/process` (opcional `?limit=20` e `?tenant_id=` em job maquina).
5. O processor le `FCM_SERVER_KEY` e envia **FCM HTTP legacy** com payload `data`; o service worker `/driver/service-worker.js` mostra notificacao no dispositivo.

## Variaveis

| Variavel | Uso |
|----------|-----|
| `FCM_SERVER_KEY` | Chave de servidor Firebase (Project settings → Cloud Messaging → Server key). Sem esta variavel os jobs falham com `PUSH_PROVIDER_NOT_CONFIGURED` e nada e marcado como enviado falsamente. |
| `NEXT_PUBLIC_FIREBASE_*` + `NEXT_PUBLIC_FCM_VAPID_KEY` | Auto-registo do token no browser (ver `.env.example`). |
| `NOTIFICATION_JOB_PROCESS_SECRET` | Bearer para o processor em ambiente agendado. |

## Smoke E2E HTTP

```bash
BASE_URL=https://seu-preview.vercel.app npm run test:e2e-smoke
```

## Estados

- `notification_jobs.status`: `success` apenas apos resposta FCM com `success > 0`; caso contrario `error` e `last_error` preenchido.
- Falhas temporarias de `notification_jobs` permanecem `queued` com `next_retry_at` ate `max_attempts`; na tentativa final viram `error` e geram registro `notifications.status=failed`.
- `notifications.status`: `sent` ou `failed` com `error` alinhado ao motivo.

## Base de dados

- `driver_push_tokens`: token por motorista (migracao `0018`).
- Politica RLS: motorista gere apenas a sua linha.

## Canal in-app (financeiro / admin)

Jobs com `channel: "in_app"` e `recipientType: "profile"` sao processados sem FCM (`processNotificationJobs` marca `success`). Usados em:

- Conclusao de corrida (`trip.completed`) para perfis `financeiro` e `admin`
- Pagavel motorista em aberto: push + in-app **apenas** quando o pós-corrida **cria** o titulo automaticamente a partir de `trip_financials` (evita duplicar com titulo ja gerado em `finance/trips/generate`).
- Conta a receber gerada automaticamente (`finance.accounts_receivable_open` in-app para admin/financeiro quando `ensureAccountsReceivableFromTripFinancials` cria titulo)
- Operacional (`operations.*`) para `admin` e `operador`: nova solicitacao, corrida aprovada, claim assumido por outro, **despacho com motorista** (`operations.trip_dispatched`), **reatribuicao** (`operations.trip_reassigned`), **cancelamento** (`operations.trip_cancelled`), **deslocamento** (`operations.trip_on_the_way`), **chegada** (`operations.trip_arrived`) e **no-show** (`operations.trip_no_show`) — ver `operational-notify.ts`

Push ao motorista continua a exigir `FCM_SERVER_KEY` e `POST /api/drivers/push-token`.

Transicoes de estado (`notifyTripStatusTransition`): push em `dispatched`, `completed`, `cancelled` e `no_show`.

## Auditoria

`POST /api/drivers/push-token` regista `driver.push_token_upsert` em `audit_events`.

## In-app (painel)

- `GET /api/notifications/in-app` — lista do perfil autenticado (`notifications.read`).
- `POST /api/notifications/in-app/[id]/read` e `.../read-all`.
- Painel em `/finance` e resumo no `/dashboard`.

## Migracoes relacionadas

- `0018`: tokens + indices de auditoria.
- `0021`: leitura RLS de `audit_events` por tenant (admin/operador/financeiro).
- `0035`–`0036`: `read_at`, realtime `notifications`.
- `0037`: `notifications.tenant_id` + RLS (in-app proprio; fila `notification_jobs` para admin/operador).

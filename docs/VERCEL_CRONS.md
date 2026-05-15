# Crons na Vercel

## Configuração

1. Defina `CRON_SECRET` no painel Vercel (mín. 16 caracteres aleatórios).
2. O ficheiro `vercel.json` agenda:
   - `/api/cron/notifications` — cada 2 min (`FCM_SERVER_KEY` obrigatório para entrega)
   - `/api/cron/erp` — cada 3 min
   - `/api/cron/dispatch-scan` — cada 5 min (despacho directo automático)
   - `/api/cron/reconcile` — diário 06:00 UTC (reconciliação ERP)

A Vercel envia `Authorization: Bearer <CRON_SECRET>` em cada invocação.

## Variáveis adicionais

| Job | Variáveis |
|-----|-----------|
| Notificações | `FCM_SERVER_KEY`, Supabase |
| ERP | credenciais Omie/Conta Azul conforme `docs/ERP_INTEGRATION.md` |
| Dispatch scan | Supabase, tenants com `auto_direct_assign_on_approve` |

## Alternativa manual

Continua válido usar `POST` com segredos dedicados (`NOTIFICATION_JOB_PROCESS_SECRET`, etc.) — ver `docs/GO_LIVE_RUNBOOK.md`.

## Plano Hobby

Crons na Vercel podem exigir plano Pro; em Hobby use **`.github/workflows/vercel-crons.yml`** (secrets `VERCEL_DEPLOYMENT_URL` + `CRON_SECRET`) ou cron externo com o mesmo segredo. Ver checklist em `docs/VERCEL_DEPLOY.md`.

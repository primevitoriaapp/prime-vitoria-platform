# Ciclo A — Secrets de produção (Vercel)

Checklist para fechar a Fase 1 operacional: crons, jobs e push motorista.

## Estado actual (verificar)

```bash
npx vercel env ls production
```

Hoje costumam existir só: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_BASE_URL`, `TRUST_HEADER_AUTH`.

## 1. Gerar secrets de máquina (local)

```bash
npm run secrets:generate
# ou gravar ficheiro local (não commitar):
npm run secrets:generate:write
```

Isto cria `.production-secrets.local` com:

| Variável | Uso |
|----------|-----|
| `CRON_SECRET` | `vercel.json` crons → `GET /api/cron/*` |
| `NOTIFICATION_JOB_PROCESS_SECRET` | Processar fila de notificações |
| `ERP_JOB_PROCESS_SECRET` | Fila ERP |
| `RECONCILE_JOB_PROCESS_SECRET` | Reconciliação diária |
| `DISPATCH_DIRECT_SCAN_SECRET` | Scan despacho directo |

## 2. Aplicar na Vercel

**Opção A — CLI (recomendado após `vercel login`):**

```bash
npm run vercel:secrets:apply
npx vercel deploy --prod
```

**Opção B — Painel:** [Vercel → Project → Settings → Environment Variables](https://vercel.com)  
Cole cada linha de `.production-secrets.local` em **Production** e **Preview**.

## 3. Firebase / FCM (manual — obrigatório para push)

1. [Firebase Console](https://console.firebase.google.com) → projeto do app motorista.
2. **Project settings → Cloud Messaging → Server key** → `FCM_SERVER_KEY`.
3. **Web Push certificates** → `NEXT_PUBLIC_FCM_VAPID_KEY`.
4. Config do app web → `NEXT_PUBLIC_FIREBASE_*` (ver `.env.example`).

Sem `FCM_SERVER_KEY`, jobs de push falham com `PUSH_PROVIDER_NOT_CONFIGURED` (comportamento correcto).

## 4. Validar após deploy

```bash
export BASE_URL=https://prime-vitoria-web.vercel.app
# Opcional: export CRON_SECRET=<mesmo valor da Vercel>
npm run vercel:preflight
npm run test:e2e-smoke
```

Com `CRON_SECRET` no ambiente local igual ao da Vercel, o preflight testa `GET /api/cron/notifications`.

Health detalhado (`/api/health?detailed=1`) indica flags `cron_secret`, `fcm_server_key`, etc.

## 5. Crons Vercel

Ver `docs/VERCEL_CRONS.md`. Plano **Hobby** pode não incluir crons nativos — usar `.github/workflows/vercel-crons.yml` com os mesmos secrets.

## Segurança

- Nunca commitar `.production-secrets.local` nem `.env.local`.
- Rodar `secrets:generate:write` de novo só se precisar **rodar** secrets (exige redeploy + actualizar crons externos).
- `TRUST_HEADER_AUTH` deve permanecer **ausente** ou `false` em produção.

## Fecho do Ciclo A

| Critério | Como confirmar |
|----------|----------------|
| Crons autenticados | `vercel:preflight` → `ok cron notifications` |
| Jobs processáveis | Logs Vercel sem 401 em `/api/cron/*` |
| Push motorista | `FCM_SERVER_KEY` + token em `POST /api/drivers/push-token` + job success |

Quando tudo OK, marcar em `docs/architecture/ROADMAP_PHASES.md` a linha «Despacho + push FCM em produção» como feita.

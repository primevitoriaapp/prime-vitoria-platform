# Deploy na Vercel — Prime Vitória

## Pré-requisitos

1. Código no GitHub (`git push -u origin main` no seu Mac, com `gh auth login` ou token).
2. Projeto Supabase (staging ou produção) com migrações `0001`–`0034` aplicadas (`npm run db:push`).
3. Conta [Vercel](https://vercel.com) ligada à org `primevitoriaapp`.

## 1. Importar o projeto

1. **Add New Project** → repositório `prime-vitoria-platform`.
2. **Framework:** Next.js (detetado automaticamente).
3. **Root Directory:** `.` (raiz).
4. **Production Branch:** `main` (ou `staging` para preview contínuo).

## 2. Variáveis de ambiente (obrigatórias)

Defina em **Settings → Environment Variables** para **Production** e **Preview**:

| Variável | Notas |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Apenas servidor — **nunca** `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_BASE_URL` | URL do deployment, ex. `https://prime-vitoria-platform.vercel.app` |
| `CRON_SECRET` | Mín. 16 caracteres aleatórios; usado pelos crons Vercel |

Gerar `CRON_SECRET` (local):

```bash
openssl rand -hex 32
```

## 3. Variáveis recomendadas (staging / go-live)

| Grupo | Variáveis |
|-------|-----------|
| Jobs | `ERP_JOB_PROCESS_SECRET`, `NOTIFICATION_JOB_PROCESS_SECRET`, `RECONCILE_JOB_PROCESS_SECRET`, `DISPATCH_DIRECT_SCAN_SECRET` |
| Push motorista | `FCM_SERVER_KEY`, `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_FCM_VAPID_KEY` |
| ERP (opcional) | `ERP_OMIE_*`, `ERP_CONTA_AZUL_*`, webhooks `ERP_*_WEBHOOK_SECRET` |
| ERP go-live | `ERP_REQUIRE_LIVE=true` + validar com `npm run erp:preflight` |
| Monitorização | `SENTRY_DSN` ou `NEXT_PUBLIC_SENTRY_DSN`; opcional `SENTRY_ORG`, `SENTRY_PROJECT` |
| Segurança | `ERP_INTEGRATION_ALLOWED_IPS` (opcional), `VERCEL_AUTOMATION_BYPASS_SECRET` para smoke automatizado em deployment protegido |

**Não definir** `TRUST_HEADER_AUTH=true` em produção.

Copie o resto de `.env.example` conforme necessidade.

### ERP em modo live

1. Preencha credenciais Omie e/ou Conta Azul (ver `docs/ERP_INTEGRATION.md`).
2. Cadastre mapeamentos `POST /api/integrations/mappings` se não usar IDs globais no env.
3. No Mac ou CI: `npm run erp:preflight` — com app no ar: `BASE_URL=https://preview.vercel.app STAGING_E2E_PASSWORD=... npm run erp:preflight -- --http`.
4. Opcional em produção: `ERP_REQUIRE_LIVE=true` para falhar preflight sem credenciais.

### Sentry

1. Crie projeto em [sentry.io](https://sentry.io) (Next.js).
2. Defina `SENTRY_DSN` (servidor) e/ou `NEXT_PUBLIC_SENTRY_DSN` (cliente) na Vercel.
3. Sem DSN, o build ignora o wrapper Sentry (`next.config.ts`).

## 4. Supabase Auth

Em **Authentication → URL Configuration**:

- **Site URL:** URL de produção Vercel
- **Redirect URLs:** `https://*.vercel.app/**` e o domínio custom

## 5. Deploy

- Primeiro deploy: automático após import + env vars → **Deployments**.
- Região: `gru1` (já em `vercel.json`).

Smoke após deploy:

```bash
export BASE_URL=https://SEU-DOMINIO.vercel.app
export VERCEL_AUTOMATION_BYPASS_SECRET=... # apenas se Deployment Protection estiver ativo
npm run test:e2e-smoke
npm run vercel:preflight

export CRON_SECRET=...
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/notifications"
```

Os preflights locais carregam, nesta ordem, `.env.supabase.local`, `.env.vercel.local`, `.env.local` e `.env`. Valores já definidos no ambiente não são substituídos.

## 6. Crons (`vercel.json`)

Com **plano Pro**, a Vercel agenda:

- `/api/cron/notifications` — 2 min
- `/api/cron/erp` — 3 min
- `/api/cron/dispatch-scan` — 5 min
- `/api/cron/reconcile` — 06:00 UTC

Requer `CRON_SECRET` no projeto. Ver `docs/VERCEL_CRONS.md`.

### Plano Hobby (sem crons Vercel)

Use o workflow **`.github/workflows/vercel-crons.yml`**: configure secrets `VERCEL_DEPLOYMENT_URL` (URL do site) e `CRON_SECRET`.

## 7. Seed staging (opcional)

Local ou CI com service role:

```bash
export STAGING_SEED_ENABLED=true
export SUPABASE_SERVICE_ROLE_KEY=...
export NEXT_PUBLIC_SUPABASE_URL=...
export STAGING_SEED_PASSWORD='...'
npm run seed:staging
```

Depois: `npm run test:e2e-staging-all` com `BASE_URL` = URL Vercel.

## 8. Checklist pós-deploy

- [ ] Login `/login` com utilizador seed
- [ ] Agenda `/agenda` — viagens e claim
- [ ] Financeiro `/finance` — títulos, fechamentos, DRE
- [ ] Motorista `/driver` — push token + corridas
- [ ] Rastreio público `/r/[token]`
- [ ] Crons ou GitHub Actions a correr (fila notificações / ERP)

## 9. CI GitHub (opcional)

- `ci.yml` — testes + build em cada PR
- `staging-e2e.yml` — smoke autenticado (secrets `STAGING_BASE_URL`, Supabase, `STAGING_E2E_PASSWORD`)
- `deploy-staging-vercel.yml` — deploy branch `staging` com `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

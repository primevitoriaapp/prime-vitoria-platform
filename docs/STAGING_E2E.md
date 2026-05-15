# Ambiente de preview / staging e testes operacionais contínuos

Este guia descreve como obter **URL pública**, **deploy contínuo**, **contas de teste** e **dados seed** para acompanhar login, corridas, despacho, agenda, timeline, realtime, motorista, tracking e permissões — **sem placeholders falsos**: o seed cria utilizadores reais no Supabase Auth e linhas nas tabelas `profiles`, `clients`, `drivers` e `trips`.

## 1. O que não pode ser feito automaticamente a partir do repositório

- Criar o projeto na **Vercel** ou na **Supabase** na tua conta.
- Gerar uma URL pública sem ligar o repositório a um fornecedor (Vercel, Cloudflare Pages, Fly.io, etc.).
- Guardar secrets no GitHub em teu nome.

Tudo abaixo assume que tens acesso de administrador à organização GitHub e às contas Vercel + Supabase.

## 2. URL acessível e deploy contínuo (recomendado: Vercel + GitHub)

### 2.1 Ligar o repositório ao Vercel

1. Em [vercel.com](https://vercel.com), **Add New Project** → importa o repositório `prime-vitoria-platform`.
2. **Framework Preset**: Next.js.
3. **Root**: raiz do repo.
4. **Environment Variables** (Production *e* Preview): copia de `.env.example` pelo menos:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (apenas servidor; não expor ao browser)
   - `NEXT_PUBLIC_BASE_URL` = URL do deployment (ex.: `https://xxx.vercel.app`)
   - Opcionais: `TRUST_HEADER_AUTH`, secrets de jobs (`ERP_JOB_PROCESS_SECRET`, `NOTIFICATION_JOB_PROCESS_SECRET`, `DISPATCH_DIRECT_SCAN_SECRET`, …)

Com isto, **cada push** na branch ligada gera **Preview Deployment** com URL única; a branch `main` costuma ir para **Production**.

### 2.2 Branch `staging` + deploy automático

- Cria a branch `staging` no Git e faz push.
- No Vercel: **Settings → Git → Production Branch** pode continuar `main`; as outras branches recebem **Preview** automaticamente.
- Opcional: no mesmo projeto Vercel, define **Promote** de um preview fixo ou usa o workflow em `.github/workflows/deploy-staging-vercel.yml` com secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`

O workflow dispara em **push** para `staging` e corre `amondnet/vercel-action` (precisa dos secrets acima).

### 2.3 CI (testes em cada alteração)

O ficheiro `.github/workflows/ci.yml` corre `npm test`, `npm run build`, sobe `npm start` em background e `npm run test:e2e-smoke` contra `http://localhost:3000` (health + tracking publico), em cada push/PR para `main` e `staging`.

## 3. Supabase de staging

1. Cria um projeto **Staging** no Supabase (separado de produção).
2. Aplica migrações: `supabase db push` ou SQL manual na ordem `0001` → … → última migração.
3. **Auth → URL configuration**: adiciona o domínio Vercel (`https://*.vercel.app` e o teu domínio custom) em **Redirect URLs** e **Site URL** se necessário.

## 4. Seed operacional (utilizadores + cliente + motorista + 2 corridas)

1. Define no shell (ou no CI só para o job de seed):

```bash
export STAGING_SEED_ENABLED=true
export NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role>"
export STAGING_SEED_PASSWORD="<palavra-passe forte, min 12 chars>"
```

2. Corre:

```bash
npm run seed:staging
```

Opcional: para **redefinir** a palavra-passe dos cinco utilizadores para o valor atual de `STAGING_SEED_PASSWORD`:

```bash
export STAGING_SEED_RESET_PASSWORD=true
npm run seed:staging
```

Isto cria (ou reutiliza) **cinco** utilizadores Auth + `profiles`:

| Papel      | Email                         |
|-----------|-------------------------------|
| admin     | staging-admin@example.com     |
| operador  | staging-operador@example.com  |
| financeiro| staging-financeiro@example.com|
| motorista | staging-motorista@example.com |
| cliente   | staging-cliente@example.com   |

Todos usam a mesma `STAGING_SEED_PASSWORD`. O cliente fica ligado ao cliente corporativo seed; o motorista tem linha em `drivers`.

Corrida exemplo:

- `requested` — para fluxo de aprovação / despacho.
- `approved` — para agenda, timeline, claims; inclui `trip_financials` + `accounts_receivable` seed para testes financeiros/ERP.

**Não commits** a `STAGING_SEED_PASSWORD` nem a service role key.

## 5. Checklist diário de testes (evolução funcional)

- **Login** — cada papel com o email acima.
- **Criação de corrida** — operador/admin (API ou UI quando existir).
- **Despacho** — direcionado vs oferta; exclusividade automática (settings).
- **Agenda** — intervalo de datas, tabela, link **Notas**; aprovar viagem `requested`; financeiro/admin: painel **Financeiro e ERP**; operador: **Sincronização ERP** (sem valores).
- **Timeline** — histórico operacional na viagem selecionada.
- **Realtime** — duas sessões: alterar estado de viagem e ver refresh na agenda/despacho.
- **Painel motorista** — `/driver` com sessão motorista.
- **Tracking básico** — `POST /api/trips/:id/tracking-token` → abrir `/r/<token>`; confirmar refresh em ~15 s ao mudar estado ou GPS (`GET /api/public/track/<token>`). Ver `docs/TRACKING.md`.
- **Reconciliacao ERP** — `POST /api/jobs/reconcile/run` (sessao financeiro) e `GET /api/integrations/reconciliation-issues?status=open`.
- **Push motorista** — login motorista em `/driver`, activar notificações (ou colar token FCM); enfileirar oferta/despacho; `POST /api/jobs/notifications/process` com `FCM_SERVER_KEY`; confirmar job `success`.
- **Fila notificações** — `GET /api/jobs/notifications?status=queued` como operador.
- **Permissões** — cliente não vê dados de outro cliente; financeiro vs operador nas APIs.
- **Claims operacionais** — assumir / libertar na agenda (admin/operador).

## 6. Túnel local rápido (sem Vercel)

Para partilhar o `localhost` durante desenvolvimento:

```bash
npx localtunnel --port 3000
# ou: npx cloudflared tunnel --url http://localhost:3000
```

Atualiza **Supabase Auth URLs** com o hostname do túnel.

## 7. Health check

`GET /api/health` — resposta JSON `{ "ok": true }` para smoke tests de uptime (monitorização / CI).

## 8. Smoke autenticado (API)

Com seed e deployment activos:

```bash
export BASE_URL=https://seu-preview.vercel.app
export NEXT_PUBLIC_SUPABASE_URL=...
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export STAGING_E2E_ROLE=operador
# ou: STAGING_E2E_ROLE=financeiro | admin
export STAGING_E2E_PASSWORD=<mesma do seed>
npm run test:e2e-staging
```

Valida sessão, viagens, fila de notificações, reconciliação (quando aplicável), títulos a receber, relatório operacional JSON/CSV (`GET /api/reports/operations/trips`, admin/financeiro), webhooks inbox, resumo `GET /api/finance/trips/:id` (financeiro/admin), `GET /api/trips/:id/finance-summary` (operador sem valores), auditoria e timeline.

Todos os papéis de seed em sequência:

```bash
npm run test:e2e-staging-all
```

Requer as mesmas variáveis; corre um smoke por `STAGING_E2E_ROLE`. GitHub Actions: workflow `staging-e2e.yml` (manual ou cron) com secrets `STAGING_BASE_URL` e `STAGING_E2E_PASSWORD`.

## 9. Playwright (browser + API em staging)

CI local (`ci.yml`): `npm run test:e2e-playwright` — health, login guest redirect, relatório sem auth (401/403).

Contra deployment real (login Supabase no browser):

```bash
export PLAYWRIGHT_STAGING=1
export PLAYWRIGHT_BASE_URL=https://seu-preview.vercel.app
export NEXT_PUBLIC_SUPABASE_URL=...
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export STAGING_E2E_PASSWORD=<mesma do seed>
npm run test:e2e-playwright:staging
```

Inclui login → agenda (operador), login → financeiro (painel webhooks), e smoke Bearer do relatório JSON/CSV.

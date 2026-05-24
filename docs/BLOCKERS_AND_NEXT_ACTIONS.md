# Blockers e próximas acções

> Actualizado em modo semi-autónomo. Produção e `main` protegidas.

## Blockers activos

| ID | Blocker | Impacto | Acção necessária (humano) |
|----|---------|---------|---------------------------|
| B1 | `VERCEL_AUTOMATION_BYPASS_SECRET` ausente localmente | Smoke HTTP no preview Vercel falha (Deployment Protection) | Criar secret em Vercel → Settings → Deployment Protection → Automation; exportar localmente ou adicionar em GitHub Secrets |
| B2 | Firebase Web / FCM (7 env vars) | Push motorista não validável em preview/prod | Seguir `docs/FIREBASE_FCM_SETUP.md` e `docs/FCM_PWA_READINESS.md` |
| B3 | `db:push` 0042 / 0043 | Índices e RLS `trip_financials` só em repo | Aprovação explícita + janela staging |
| B4 | Merge PR #1 → `cursor/pricing-engine-mvp-cycle` | Night cycle não integrado na branch pricing | Aprovação após smoke preview PASS |

## Playwright CI (PR #1)

- Testes API (`reports-api`, `public-track`) aceitam respostas com Supabase placeholder em CI.
- Testes pilot mock com SSR ignorados em CI padrão; usar `PLAYWRIGHT_STAGING=1` para E2E real.

## Resolvido neste ciclo

| Item | Resolução |
|------|-----------|
| Build Vercel (capabilities TS) | `7c114f8` |
| CI YAML indentação | `da18185` |
| E2E bypass header | `35e928e` |
| `.env.vercel.local` placeholders | `isPlaceholderEnvValue` em `env-files.mjs` |

## Próximas acções (ordem sugerida)

1. Configurar `VERCEL_AUTOMATION_BYPASS_SECRET` + `STAGING_E2E_PASSWORD` em GitHub Secrets → correr workflow `Preview PR smoke`
2. Smoke manual no URL do PR #1 (browser motorista)
3. Aprovar merge PR #1 (sem main)
4. Aprovar `db:push` 0042 em staging
5. FCM no Vercel → validar push motorista

## Comandos úteis

```bash
# Smoke local (build com .env.supabase.local)
set -a && source .env.supabase.local && set +a && npm run build
PORT=3010 npm start &
export BASE_URL=http://127.0.0.1:3010 STAGING_E2E_PASSWORD='...'
npm run test:night-preview-smoke

# Smoke preview (com bypass)
export BASE_URL=https://prime-vitoria-web-git-cursor-night-cycl-....vercel.app
export VERCEL_AUTOMATION_BYPASS_SECRET='...'
npm run test:night-preview-smoke
```

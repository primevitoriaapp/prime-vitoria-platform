# Blockers e próximas acções

> Actualizado em **modo MVP operacional** ([MVP_OPERATIONAL_MODE.md](./MVP_OPERATIONAL_MODE.md)). Produção e `main` protegidas.

## Blockers activos

| ID | Blocker | Impacto | Acção necessária (humano) |
|----|---------|---------|---------------------------|
| B1 | `VERCEL_AUTOMATION_BYPASS_SECRET` ausente localmente | Smoke HTTP no preview Vercel falha (Deployment Protection) | Criar secret em Vercel → Settings → Deployment Protection → Automation; exportar localmente ou adicionar em GitHub Secrets |
| B2 | Firebase Web / FCM (7 env vars) | Push motorista não validável em preview/prod | Seguir `docs/FIREBASE_FCM_SETUP.md` e `docs/FCM_PWA_READINESS.md` |
| B3 | `db:push` 0042 / 0043 | Índices e RLS `trip_financials` só em repo | Aprovação explícita + janela staging |
| B4 | Merge PR #1 → `cursor/pricing-engine-mvp-cycle` | — | **Concluído** @ `0e4398a` (2026-05-24) |
| B5 | Smoke humano operação real | Validação dia-a-dia incompleta | Checklist em `MVP_OPERATIONAL_MODE.md`; staging + 3 papéis |

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

## Próximas acções (modo MVP operacional)

1. **Smoke humano** — [OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md)
2. **FCM smoke** — [FCM_OPERATIONAL_SMOKE.md](./FCM_OPERATIONAL_SMOKE.md) após secrets Vercel
3. Configurar `VERCEL_AUTOMATION_BYPASS_SECRET` + `STAGING_E2E_PASSWORD` → workflow Preview smoke
4. UX motorista: menos cliques, estados mais claros (commits pequenos na branch `cursor/pricing-engine-mvp-cycle`)
5. Portal cliente read-only: polish consulta (sem activar writes por defeito)
6. Aprovar `db:push` 0042 em staging (índices fila) — quando houver janela

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

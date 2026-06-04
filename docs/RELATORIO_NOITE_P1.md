# Relatório noite — desbloqueio homologação P1

> Data: 2026-05-30 · **P2 bloqueado** · **produção intocada** · **sem merge main**

---

## Resumo executivo

O código P1 está na branch `cursor/pricing-engine-mvp-cycle` (commit `3cd8522`) e **deployado** no Vercel.  
**Você ainda não consegue homologar** porque:

1. O domínio principal é **produção antiga** (`main`).
2. O preview P1 devolve **401** (Vercel Authentication).
3. Migration **0044** e **seed** dependem de secrets + workflows (não executados).

Esta noite a engenharia **preparou documentação, scripts e páginas de diagnóstico** — não alterou produção nem aplicou migrations remotas (sem credenciais).

---

## O que foi preparado

| # | Entrega | Onde |
|---|---------|------|
| 1 | Mapa produção vs preview vs commits | `docs/P1_AMBIENTES_DIAGNOSTICO.md` |
| 2 | **URL única P1** | `docs/P1_HOMOLOGACAO_URL_OFICIAL.md` + `/p1-homologacao` |
| 3 | Desbloquear preview 401 (passo a passo Vercel) | `docs/P1_VERCEL_PREVIEW_ACESSO.md` |
| 4 | Checklist secrets GitHub vs Vercel | `docs/P1_SECRETS_CHECKLIST.md` |
| 5 | Migration 0044 segura + validação | `docs/P1_MIGRATION_0044_STAGING.md`, `npm run db:apply-0044-staging` |
| 6 | Seed + 5 logins + reset senha | `docs/P1_SEED_LOGINS.md` |
| 7 | Checklist operacional (Segpro, Felipe, BYD King, despacho) | `docs/P1_CHECKLIST_HOMOLOGACAO.md` |
| 8 | Guia **amanhã** (passos em ordem) | `docs/AMANHA_P1.md` |
| 9 | Índice de todos os docs P1 | `docs/P1_INDEX.md` |
| 10 | Página `/staging-status` + API `/api/staging-status` | sem secrets |
| 11 | Scripts diagnóstico | `p1:check-preview`, `p1:compare-environments`, `p1:night-unblock`, `p1:homologation:handoff`, `p1:amanha` |

---

## O que foi corrigido / melhorado (código)

- `staging-status`: listas `blockers` e `next_steps` no JSON e na página.
- `/p1-homologacao`: passos de amanhã + 5 logins.
- `/login`: links para homologação quando `NEXT_PUBLIC_STAGING_SMOKE_HINTS=true`.

**Não feito (fora de scope / sem acesso):**

- Desactivar Vercel Authentication (ação Rubens).
- Configurar secrets GitHub/Vercel.
- Correr workflows 0044 / seed.
- Prints ou vídeo dos fluxos (requer ambiente acessível).

---

## Estado verificado remotamente (esta noite)

| Check | Resultado |
|-------|-----------|
| Deploy `3cd8522` | ✅ GitHub + Vercel bot = DEPLOYED |
| Preview URL HTTP | ❌ **401** Vercel Authentication |
| Produção URL HTTP | ✅ 200 — UI **antiga** (esperado) |
| Migration 0044 | ❓ Não verificada (sem `STAGING_DATABASE_URL`) |
| Seed / logins | ❓ Não testados (sem senha no ambiente) |

---

## O que depende de você / Rubens amanhã

### Rubens (~15 min) — desbloqueia o ambiente

1. **Vercel** → `prime-vitoria-web` → Settings → Deployment Protection → Preview → **desactivar Vercel Authentication**  
   → `npm run p1:check-preview` deve mostrar **HTTP 200**

2. **GitHub Secrets** (Actions): `STAGING_DATABASE_URL`, `STAGING_E2E_PASSWORD`, chaves Supabase  
   → Ver tabela em `docs/P1_SECRETS_CHECKLIST.md`

3. **Vercel Preview env**: mesmas chaves Supabase + `NEXT_PUBLIC_BASE_URL` = URL preview + `NEXT_PUBLIC_STAGING_SMOKE_HINTS=true` → **Redeploy**

4. **Actions** → **Staging migration 0044** → Run

5. **Actions** → **Staging seed (remote)** → Run, `reset_password: true`

6. Enviar **senha** staging ao tester (canal seguro)

### Você (~25 min) — homologação

1. Abrir **só** a URL abaixo (não o domínio principal).
2. `/staging-status` → confirmar pronto.
3. Login **operador** + senha recebida.
4. Executar 4 testes em `docs/P1_CHECKLIST_HOMOLOGACAO.md`.
5. Enviar **4 prints** ou **1 vídeo ≤2 min**.

---

## URL para abrir amanhã

### https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app

| | |
|---|---|
| Status | `/staging-status` |
| Guia rápido | `/p1-homologacao` |
| **Não usar** | https://prime-vitoria-web.vercel.app |

**Deployment Vercel:** https://vercel.com/rubens-projects2/prime-vitoria-web/b4zBDpLScquyL6hLqyAs4NxDL3cP

---

## Comandos (terminal)

```bash
# 1. Preview acessível?
npm run p1:check-preview

# 2. Diagnóstico completo
npm run p1:night-unblock

# 3. Cartão URL + logins
npm run p1:homologation:handoff

# 4. Validar 0044 (após secret no shell)
DATABASE_URL="$STAGING_DATABASE_URL" npm run db:validate-operational-0044
```

---

## Logins (senha = `STAGING_E2E_PASSWORD` definida no seed)

| Papel | Email |
|-------|--------|
| Admin | staging-admin@example.com |
| **Operador** | **staging-operador@example.com** ← homologação P1 |
| Financeiro | staging-financeiro@example.com |
| Motorista | staging-motorista@example.com |
| Cliente | staging-cliente@example.com |

---

## Evidências que você deve enviar

1. Print `/staging-status` com ambiente OK (ou workflow 0044 verde).
2. Print menu com Clientes · Motoristas · Veículos · Despacho.
3. Print cliente **Segpro** gravado.
4. Print **Felipe** + **BYD King** vinculado.
5. Print **despacho** concluído.

Ou 1 vídeo curto cobrindo os 4 fluxos.

---

## Critério de aprovação P1

> **P1 aprovado** = preview acessível + 0044 PASS + 4 testes operacionais PASS + evidência.

Até lá: **P2 bloqueado**, **produção intocada**, **sem merge main**.

Guia passo a passo: **[AMANHA_P1.md](./AMANHA_P1.md)**

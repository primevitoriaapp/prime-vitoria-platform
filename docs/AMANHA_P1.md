# Amanhã — homologar P1 em 30–45 minutos

> **Relatório noite (engenharia):** [RELATORIO_NOITE_P1.md](./RELATORIO_NOITE_P1.md) · **3 acções Rubens** desbloqueiam o teste real.  
> **P2 bloqueado** · **sem produção** · **sem merge main**

---

## URL única para abrir

### https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app

| | |
|---|---|
| Login homologação | `staging-operador@example.com` |
| Senha | Valor que **você/Rubens** definiu em `STAGING_E2E_PASSWORD` (não está no repo) |
| Status do ambiente | `/staging-status` na URL acima |
| Guia URL | [P1_HOMOLOGACAO_URL_OFICIAL.md](./P1_HOMOLOGACAO_URL_OFICIAL.md) |

**Não abrir:** https://prime-vitoria-web.vercel.app (produção antiga)

---

## Passos em ordem (execute nesta sequência)

### Passo 1 — Desbloquear preview (~5 min) — **Rubens**

1. https://vercel.com/rubens-projects2/prime-vitoria-web → **Settings** → **Deployment Protection**
2. **Preview** → desactivar **Vercel Authentication**
3. No terminal (ou pedir a quem tem o repo):

```bash
npm run p1:check-preview
```

**PASS:** `HTTP 200` e mensagem `preview acessível`  
**FAIL:** ainda `401` → ver [P1_VERCEL_PREVIEW_ACESSO.md](./P1_VERCEL_PREVIEW_ACESSO.md)

---

### Passo 2 — Secrets GitHub (~10 min) — **Rubens**

Repositório → **Settings → Secrets → Actions** — criar/confirmar:

| Secret | Onde obter |
|--------|------------|
| `STAGING_DATABASE_URL` | Supabase → Project Settings → Database → URI |
| `STAGING_E2E_PASSWORD` | Escolher senha ≥12 chars (ex. `PrimeVitoria2026!`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (service_role) |

Detalhe: [P1_SECRETS_CHECKLIST.md](./P1_SECRETS_CHECKLIST.md)

**Vercel Preview** (mesmo projecto): as 3 chaves Supabase +  
`NEXT_PUBLIC_BASE_URL` = URL do preview (tabela acima) +  
`NEXT_PUBLIC_STAGING_SMOKE_HINTS` = `true` → **Redeploy** preview.

---

### Passo 3 — Migration 0044 (~3 min) — **Rubens**

**Actions** → **Staging migration 0044 (P1 cadastro)** → **Run workflow**  
Branch: `cursor/pricing-engine-mvp-cycle`

**PASS:** job verde + log `RESULTADO: PASS`

---

### Passo 4 — Seed + senha (~3 min) — **Rubens**

**Actions** → **Staging seed (remote)** → **Run workflow**  
`reset_password`: **true** (primeira vez ou se login falhar)

Enviar a senha (`STAGING_E2E_PASSWORD`) ao tester por canal seguro.

Logins: [P1_SEED_LOGINS.md](./P1_SEED_LOGINS.md)

---

### Passo 5 — Confirmar ambiente (~2 min) — **Você**

1. Abrir URL do preview (Passo 1 OK)
2. Abrir `/staging-status`
3. Confirmar:
   - `is_p1_environment`: true
   - `migration_0044.ready`: true
   - `staging_seed.users_found`: 5

---

### Passo 6 — Homologação operacional (~20 min) — **Você**

Login: **operador** + senha do Passo 4.

Checklist: [P1_CHECKLIST_HOMOLOGACAO.md](./P1_CHECKLIST_HOMOLOGACAO.md)

| # | Pergunta | PASS? |
|---|----------|-------|
| 1 | Criar cliente **Segpro**? | |
| 2 | Cadastrar **Felipe** motorista? | |
| 3 | Vincular **BYD King** ao Felipe? | |
| 4 | **Despachar** corrida? | |

**Enviar:** 4 prints ou 1 vídeo ≤2 min + checklist preenchido.

**Só com os 4 PASS:** P1 aprovado. **P2 continua bloqueado** até lá.

---

## Comandos úteis

```bash
# Comparar produção vs preview (HTTP + UI)
npm run p1:compare-environments

# Diagnóstico completo (blockers)
npm run p1:night-unblock

# Imprimir este guia no terminal
npm run p1:amanha

# Cartão URL + logins + estado
npm run p1:homologation:handoff

# Só preview 401/200
npm run p1:check-preview

# Validar 0044 (se tiver DATABASE_URL no shell)
DATABASE_URL="$STAGING_DATABASE_URL" npm run db:validate-operational-0044
```

---

## O que a engenharia preparou esta noite

| Item | Ficheiro / comando |
|------|-------------------|
| URL única documentada | `docs/P1_HOMOLOGACAO_URL_OFICIAL.md` |
| Mapa ambientes | `docs/P1_AMBIENTES_DIAGNOSTICO.md` |
| Desbloquear Vercel 401 | `docs/P1_VERCEL_PREVIEW_ACESSO.md` |
| Checklist secrets | `docs/P1_SECRETS_CHECKLIST.md` |
| Migration 0044 segura | `docs/P1_MIGRATION_0044_STAGING.md` + `npm run db:apply-0044-staging` |
| Seed + 5 logins | `docs/P1_SEED_LOGINS.md` |
| Checklist homologação | `docs/P1_CHECKLIST_HOMOLOGACAO.md` |
| Página `/staging-status` | diagnóstico no browser |
| Página `/p1-homologacao` | URL oficial na app |
| API `/api/staging-status` | JSON sem secrets |
| Scripts | `p1:check-preview`, `p1:night-unblock`, `p1:homologation:handoff` |

**Não feito (depende de vocês):** desactivar Vercel Auth, secrets, workflows, testes manuais, prints.

---

## O que ainda depende de você / Rubens

1. Desactivar **Vercel Authentication** no preview  
2. Configurar **secrets** (GitHub + Vercel Preview)  
3. Correr workflows **0044** + **seed**  
4. Comunicar **senha** staging  
5. Executar **4 testes** e enviar **evidência**

---

## Critério final

> **P1 aprovado** = uma URL (preview) + login operador + 4 fluxos PASS + 0044 PASS + evidência.  
> Até lá: **P2 bloqueado**, **produção intocada**.

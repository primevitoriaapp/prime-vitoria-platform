# Checklist único — Secrets P1 homologação

> Onde configurar cada valor. **Nunca commitar** passwords ou connection strings.

---

## Resumo rápido

| Secret / variável | GitHub Actions | Vercel Preview | Quem define |
|-------------------|:--------------:|:--------------:|-------------|
| `STAGING_DATABASE_URL` | ✅ | ❌ | Rubens (Supabase → Database → URI) |
| `STAGING_E2E_PASSWORD` | ✅ | ❌ | Rubens (senha teste, ≥12 chars) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Supabase → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | Supabase → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | Supabase → API (servidor) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | ✅ | ❌ | Vercel → Deployment Protection → Automation |
| `NEXT_PUBLIC_BASE_URL` | ❌ | ✅ | URL do **preview** (não produção) |
| `NEXT_PUBLIC_STAGING_SMOKE_HINTS` | ❌ | ✅ opcional | `true` — atalhos login staging |
| `STAGING_BASE_URL` | ✅ opcional | ❌ | = URL preview oficial |

---

## 1. GitHub — Settings → Secrets and variables → Actions

Repositório: `primevitoriaapp/prime-vitoria-platform`

| Secret | Usado por | Para quê |
|--------|-----------|----------|
| `STAGING_DATABASE_URL` | Staging migration 0044, Staging P1 validation | Apply + validate migration 0044 |
| `STAGING_E2E_PASSWORD` | Staging seed, Preview PR smoke, P1 validation | Senha dos 5 users staging (= `STAGING_SEED_PASSWORD` no seed) |
| `NEXT_PUBLIC_SUPABASE_URL` | Seed, smoke, Playwright | Auth + APIs |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Seed, smoke, Playwright | Auth cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed, smoke | Admin API + profiles |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview PR smoke | Header bypass se preview protegido |
| `STAGING_BASE_URL` | Smoke (opcional) | Override URL preview |

**Workflows que dependem disto:**

| Workflow | Secrets mínimos |
|----------|-----------------|
| Staging migration 0044 (P1 cadastro) | `STAGING_DATABASE_URL` |
| Staging seed (remote) | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_E2E_PASSWORD` |
| Staging P1 validation | Todos acima + `VERCEL_AUTOMATION_BYPASS_SECRET` |
| Preview PR smoke | `STAGING_E2E_PASSWORD`, Supabase keys, `VERCEL_AUTOMATION_BYPASS_SECRET` |

---

## 2. Vercel — Project `prime-vitoria-web` → Settings → Environment Variables

Scope: **Preview** (não só Production)

| Variável | Valor correcto |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (servidor) |
| `NEXT_PUBLIC_BASE_URL` | `https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app` |
| `NEXT_PUBLIC_STAGING_SMOKE_HINTS` | `true` (recomendado para homologação) |

**Erro comum:** `NEXT_PUBLIC_BASE_URL` = URL de produção → login/cookies quebram no preview.

Após alterar env vars → **Redeploy** o preview.

---

## 3. Ordem de configuração (primeira vez)

1. Vercel Preview env vars (Supabase + `NEXT_PUBLIC_BASE_URL`)  
2. GitHub secrets (mesmas chaves Supabase + `STAGING_DATABASE_URL` + `STAGING_E2E_PASSWORD`)  
3. Desactivar Vercel Authentication no preview → [P1_VERCEL_PREVIEW_ACESSO.md](./P1_VERCEL_PREVIEW_ACESSO.md)  
4. Actions → **Staging migration 0044** → Run  
5. Actions → **Staging seed (remote)** → Run (`reset_password: true` na 1ª vez)  
6. `npm run p1:check-preview` → HTTP 200  
7. Abrir URL oficial → homologar → [P1_CHECKLIST_HOMOLOGACAO.md](./P1_CHECKLIST_HOMOLOGACAO.md)

---

## 4. Comunicar senha ao tester

A senha vive só em:

- GitHub secret `STAGING_E2E_PASSWORD`
- Variável local `STAGING_SEED_PASSWORD` ao correr seed manual

**Não está no repositório.** Rubens envia por canal seguro (1Password, WhatsApp privado, etc.).

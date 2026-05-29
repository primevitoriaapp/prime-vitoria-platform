# Validação P1 no staging (migration 0044 + UI)

> **Não aplicar em produção.** Usar o projeto Supabase ligado ao preview (`cursor/pricing-engine-mvp-cycle`).

## 1. Aplicar migration 0044 (aditiva)

Ficheiro: `supabase/migrations/0044_operational_cadastro_extend.sql`

### Opção A — GitHub Actions (recomendado)

1. Repositório → **Actions** → workflow **Staging P1 validation** (ou **Staging migration 0044**).
2. **Run workflow** → branch `cursor/pricing-engine-mvp-cycle`.
3. Secret obrigatório: **`STAGING_DATABASE_URL`** (URI Postgres do Supabase de staging, não produção).

### Opção B — Local (com connection string)

```bash
export DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
bash scripts/apply-migration.sh supabase/migrations/0044_operational_cadastro_extend.sql
npm run db:validate-operational-0044
```

### Opção C — Supabase CLI (linked)

```bash
npx supabase link --project-ref <ref-staging>
npm run db:push   # aplica pendentes, incluindo 0044
npm run db:validate-operational-0044 -- --linked
```

Validação read-only (sem alterar dados):

```bash
npm run db:validate-operational-0044
```

## 2. Validar UI no preview

URL oficial: ver `docs/STAGING_PREVIEW_OFFICIAL.md`.

Playwright (com secrets locais ou CI):

```bash
export PLAYWRIGHT_STAGING=1
export PLAYWRIGHT_BASE_URL="https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app"
export NEXT_PUBLIC_SUPABASE_URL="..."
export NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
export STAGING_E2E_PASSWORD="..."
export VERCEL_AUTOMATION_BYPASS_SECRET="..."   # se preview protegido
npx playwright install chromium
npx playwright test e2e/p1-operational-cadastro-staging.spec.ts
```

Screenshots: `artifacts/p1-staging/*.png`

## 3. Checklist manual (operador)

| Área | Verificar |
|------|-----------|
| `/clients` | Select PF/PJ, CPF/CNPJ separado, consulta CNPJ, salvar PJ manual, editar, desactivar |
| `/drivers` | Ficha, telefone/WhatsApp, endereço, activo/disponível, categoria/região, Pix/banco, vincular/criar veículo, padrão |
| `/vehicles` | Placas dos veículos vinculados aparecem na frota |
| Despacho | Motorista + veículo vinculado; auto se um só veículo |

## 4. Secrets GitHub (Actions)

| Secret | Uso |
|--------|-----|
| `STAGING_DATABASE_URL` | Apply + validate migration 0044 |
| `STAGING_BASE_URL` | URL preview |
| `STAGING_E2E_PASSWORD` | Login seed |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` | Auth + APIs |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview protegido |

Sem `STAGING_DATABASE_URL`, a migration **não** foi aplicada pelo CI automático deste agente.

## 5. Próximo passo

Se `db:validate-operational-0044` = **PASS** e Playwright/checklist = **PASS** → iniciar **P2** (ficha corrida / OS completa).

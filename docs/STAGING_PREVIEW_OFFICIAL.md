# URL oficial de staging / preview (smoke humano)

> **Homologação P1:** ver **[P1_HOMOLOGACAO_URL_OFICIAL.md](./P1_HOMOLOGACAO_URL_OFICIAL.md)** e **[AMANHA_P1.md](./AMANHA_P1.md)** (passos amanhã).

> **Não usar** `https://prime-vitoria-web.vercel.app` para validar o ciclo `cursor/pricing-engine-mvp-cycle` — essa URL é **produção** (`main`).

## URL única (branch `cursor/pricing-engine-mvp-cycle`)

| Campo | Valor |
|--------|--------|
| **Preview (smoke)** | https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app |
| **Branch** | `cursor/pricing-engine-mvp-cycle` |
| **PR** | https://github.com/primevitoriaapp/prime-vitoria-platform/pull/2 |
| **Commit (último deploy Ready)** | Confirmar em https://vercel.com/rubens-projects2/prime-vitoria-web (deployment do PR) — esperado `7247f64` ou posterior na branch |
| **Produção (evitar)** | https://prime-vitoria-web.vercel.app |

O alias `git-*` muda quando o Vercel gera novo deployment; o link **Preview** no comentário do bot Vercel no PR #2 é sempre o correcto.

## Correcção deploy Preview (dados zerados na agenda)

Se a agenda mostrava **0 viagens** com login correcto: o servidor chamava a API em `NEXT_PUBLIC_BASE_URL` (produção) em vez do deployment actual.  
Corrigido com `VERCEL_URL` em `resolveAppBaseUrl()` — redeploy do commit com esta correcção é necessário.

## Corridas seed — quem vê o quê (importante)

| ID | Estado após seed | Operador `/agenda` | Motorista `/driver` | Cliente `/client` |
|----|------------------|--------------------|-----------------------|-------------------|
| `c2000000-0000-4000-8000-000000000001` | **requested** | Sim | **Não** (até despacho) | Sim |
| `c2000000-0000-4000-8000-000000000002` | **dispatched** + motorista | Sim | **Sim** (aceitar já) | Sim |

Se o motorista abre `/driver` e não vê a `…000001`, é **esperado** até o operador aprovar e despachar.  
Para teste rápido do painel motorista com dados reais, use a `…000002` ou complete o despacho da `…000001`.

Verificação remota (sem mock UI):

```bash
export BASE_URL="https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app"
export VERCEL_AUTOMATION_BYPASS_SECRET="..."
export NEXT_PUBLIC_SUPABASE_URL="..."
export NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export STAGING_E2E_PASSWORD="..."
npm run staging:real-check
```

Seed remoto (GitHub Actions → **Staging seed (remote)**) com secrets `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_E2E_PASSWORD`.

## Por que o preview parece “produção antiga” ou incompleto

1. **URL errada** — produção não tem utilizadores/corridas seed.
2. **Deployment Protection** — sem login na equipa Vercel, o browser pode não chegar à app (401).
3. **`NEXT_PUBLIC_BASE_URL` no Preview = URL de produção** — cookies/redirect Supabase quebram login e `/driver`, `/client`.
4. **Preview e Production partilham o mesmo Supabase** sem seed — login staging falha ou agenda vazia.
5. **`SUPABASE_SERVICE_ROLE_KEY` ausente no Preview** — após login, leitura de `profiles` pode falhar no servidor.
6. **Seed nunca corrido** — `staging-motorista@` / corrida `c2000000-…` não existem.
7. **`TRUST_HEADER_AUTH=true` em produção** — não é o fluxo do smoke; use email/senha do seed.

## Checklist para deixar o preview utilizável

### A. Vercel (Preview environment)

1. **Settings → Environment Variables → Preview** (não só Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_BASE_URL` = **URL do alias preview** (tabela acima), não `prime-vitoria-web.vercel.app`
2. **Deployment Protection**: membro da equipa com acesso, ou `VERCEL_AUTOMATION_BYPASS_SECRET` para scripts.
3. Opcional smoke UI: `NEXT_PUBLIC_STAGING_SMOKE_HINTS=true` (só Preview).

### B. Supabase (projeto ligado ao preview)

1. Migrações aplicadas (sem `db:push` destrutivo sem aprovação — usar o mesmo processo já acordado).
2. **Authentication → URL Configuration**: `https://*.vercel.app/**` nos Redirect URLs.
3. Seed:

```bash
export STAGING_SEED_ENABLED=true
export NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role>"
export STAGING_SEED_PASSWORD="<min 12 chars>"
npm run seed:staging
```

4. Usar a **mesma** palavra-passe em testes: `STAGING_E2E_PASSWORD` = valor do seed.

### C. GitHub Actions (validação automática)

Secrets em **Settings → Secrets → Actions**:

- `STAGING_BASE_URL` = URL preview acima
- `STAGING_E2E_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `VERCEL_AUTOMATION_BYPASS_SECRET`

Sem isto, o workflow `preview-pr-smoke.yml` **não testa** o preview (apenas `npm test`).

## Diagnóstico local

```bash
export BASE_URL="https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app"
export VERCEL_AUTOMATION_BYPASS_SECRET="..."   # se protegido
export NEXT_PUBLIC_SUPABASE_URL="..."
export NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export STAGING_E2E_PASSWORD="..."              # = seed
npm run staging:diagnostic
```

## Logins smoke (após seed)

| Papel | Email | Rota |
|--------|--------|------|
| Operador | staging-operador@example.com | `/agenda` |
| Motorista | staging-motorista@example.com | `/driver` |
| Cliente | staging-cliente@example.com | `/client` |

Corrida oficial: `c2000000-0000-4000-8000-000000000001`

## Verificar deployment correcto no browser

Abra:

`https://<preview>/api/health?detailed=1`

(autenticado no Vercel se protegido)

Confirme:

- `checks.supabase_public` e `checks.supabase_service` = `true`
- `staging_runtime.vercel_env` = `"preview"`
- `staging_runtime.base_url_matches_deployment` = `true` (ou hosts iguais)

Se `configured_base_url_host` for `prime-vitoria-web.vercel.app` em preview → corrigir `NEXT_PUBLIC_BASE_URL` no Vercel.

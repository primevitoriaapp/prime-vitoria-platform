# Seed staging — logins P1

> Mesma senha para todos os utilizadores de teste.  
> Senha = valor de `STAGING_E2E_PASSWORD` (GitHub) ou `STAGING_SEED_PASSWORD` (seed local).

---

## Definir senha nova (primeira vez ou reset)

### GitHub Actions (recomendado)

1. **Settings → Secrets → Actions** → criar/actualizar `STAGING_E2E_PASSWORD` (mín. **12 caracteres**)  
2. **Actions** → **Staging seed (remote)** → **Run workflow**  
3. Input **`reset_password`**: `true` (repor passwords de todos os staging users)  
4. Comunicar a senha ao tester por canal seguro

### Local (quem tem service role)

```bash
export STAGING_SEED_ENABLED=true
export STAGING_SEED_RESET_PASSWORD=true
export NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role>"
export STAGING_SEED_PASSWORD="SuaSenhaStaging12+"
npm run seed:staging
```

---

## 5 logins e rotas

| Papel | Email | Rota após login | Uso na homologação P1 |
|-------|--------|-----------------|------------------------|
| Admin | `staging-admin@example.com` | `/dashboard` | Visão geral |
| **Operador** | `staging-operador@example.com` | `/clients` ou `/agenda` | **Clientes, motoristas, veículos, despacho** |
| Financeiro | `staging-financeiro@example.com` | `/finance` | Módulo financeiro |
| Motorista | `staging-motorista@example.com` | `/driver` | Painel motorista |
| Cliente | `staging-cliente@example.com` | `/client` | Portal cliente |

**Homologação P1 (Segpro, Felipe, BYD King, despacho):** usar **Operador**.

---

## Atalhos no login (preview)

Com `NEXT_PUBLIC_STAGING_SMOKE_HINTS=true` no Vercel Preview, a página `/login` mostra botões para preencher email automaticamente.

---

## Corridas seed (despacho)

| ID | Estado | Uso |
|----|--------|-----|
| `c2000000-0000-4000-8000-000000000001` | requested | Despachar na agenda |
| `c2000000-0000-4000-8000-000000000002` | dispatched | Motorista já vê no `/driver` |

O seed **não** cria veículos nem vínculo BYD — Felipe/BYD King são criados na homologação manual.

---

## Erros comuns

| Sintoma | Acção |
|---------|--------|
| Invalid login credentials | Correr seed com `reset_password: true` |
| Login OK mas agenda vazia | Seed no Supabase **ligado ao preview** (mesmas env vars) |
| Sem atalhos staging no login | `NEXT_PUBLIC_STAGING_SMOKE_HINTS=true` no Preview + redeploy |

---

## Verificar seed sem expor senha

```bash
# Com secrets no shell
npm run p1:homologation:handoff
# Linhas Auth * : OK
```

Ou no preview: `/staging-status` → `staging_seed.users_found` = 5/5

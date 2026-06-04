# Migration 0044 — staging apenas (P1 cadastro)

> **Nunca aplicar em produção** sem aprovação explícita.  
> Ficheiro: `supabase/migrations/0044_operational_cadastro_extend.sql` (aditivo, `IF NOT EXISTS`).

---

## O que a 0044 adiciona

Colunas em `clients`, `drivers`, `vehicles`, `driver_vehicle_links.is_default`.  
Sem 0044: UI P1 abre, mas **gravar** campos novos falha.

---

## Opção A — GitHub Actions (recomendado)

1. Secret `STAGING_DATABASE_URL` configurado  
2. **Actions** → **Staging migration 0044 (P1 cadastro)** → **Run workflow**  
3. Branch: `cursor/pricing-engine-mvp-cycle`  
4. `skip_apply`: `false`  
5. Job verde + passo `npm run db:validate-operational-0044` = PASS

---

## Opção B — Script seguro local

```bash
export STAGING_DATABASE_URL="postgresql://postgres.[ref]:[PASSWORD]@...supabase.com:5432/postgres"
export CONFIRM_STAGING_MIGRATION=true
npm run db:apply-0044-staging
npm run db:validate-operational-0044
```

O script `apply-migration-0044-staging.sh` exige `CONFIRM_STAGING_MIGRATION=true` e usa só `STAGING_DATABASE_URL`.

---

## Opção C — Só validar (read-only)

```bash
export DATABASE_URL="$STAGING_DATABASE_URL"
npm run db:validate-operational-0044
```

| Resultado | Significado |
|-----------|-------------|
| `RESULTADO: PASS` | 0044 aplicada — pode homologar gravação |
| `FAIL` — coluna ausente | Correr Opção A ou B |
| `FAIL` — versão 0044 ausente | Idem |

---

## Relatório do que falta para PASS

| Verificação | Se FAIL |
|-------------|---------|
| `migration 0044 registada em schema_migrations` | Aplicar SQL |
| `clients.trade_name` | Aplicar SQL |
| `clients.whatsapp` | Aplicar SQL |
| `drivers.available` | Aplicar SQL |
| `drivers.operational_category` | Aplicar SQL |
| `vehicles.brand` | Aplicar SQL |
| `driver_vehicle_links.is_default` | Aplicar SQL |

---

## Guardas de segurança

- Usar connection string do projeto **staging** (confirmar ref no Supabase)  
- **Não** usar `npm run db:push` sem aprovação  
- **Não** definir `DATABASE_URL` de produção com `CONFIRM_STAGING_MIGRATION=true`  
- Deploy Vercel **não** aplica migrations automaticamente

---

## Após PASS

1. Abrir preview → `/staging-status` → `migration_0044.ready: true`  
2. Homologar gravação em [P1_CHECKLIST_HOMOLOGACAO.md](./P1_CHECKLIST_HOMOLOGACAO.md)

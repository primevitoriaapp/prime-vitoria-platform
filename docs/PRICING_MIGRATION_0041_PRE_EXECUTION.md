# Migration 0041 — Relatório pré-execução

> **Estado:** preparado, **não executado**  
> **Projecto linked:** `tcpgmndarqxwfnonzurl`  
> **Última migration remota:** `0040_operations_queue_index`  
> **Pendente:** `0041_pricing_rules.sql` apenas

---

## Comandos preparados (não executar sem aprovação)

### 1. Dry-run (confirma o que seria aplicado — read-only)

```bash
./scripts/db-push-pricing-0041.sh dry-run
# equivalente:
npx supabase db push --linked --dry-run
```

**Resultado esperado do dry-run (já verificado):**

```
Would push these migrations:
 • 0041_pricing_rules.sql
```

### 2. Execução (só após aprovação explícita)

```bash
CONFIRM=1 ./scripts/db-push-pricing-0041.sh push
# equivalente:
npx supabase db push --linked
```

### 3. Re-validação read-only pós-migration

```bash
npm run db:validate-pricing-0041
# ou contra DB local:
npm run db:validate-pricing-0041 -- --local
```

---

## Migrations que serão aplicadas

| Version | Ficheiro | Alterações |
|---------|----------|------------|
| **0041** | `0041_pricing_rules.sql` | Única migration pendente |

**Conteúdo da 0041 (additive):**

1. `CREATE TYPE pricing_calculation_type` (enum 6 valores)
2. `CREATE TABLE pricing_rules` (+ FK `tenants`, `clients`)
3. `CREATE INDEX idx_pricing_rules_tenant_client_active`
4. `ALTER TABLE trips ADD COLUMN` — `km_billable`, `pricing_rule_id`, `calculation_metadata`
5. `ALTER TABLE trip_financials ADD COLUMN` — `pricing_rule_id`, `calculation_metadata`
6. `ENABLE RLS` em `pricing_rules` + 2 políticas (`tenant_read`, `tenant_write`)

**Não inclui:** drop, truncate, alter destrutivo, dados seed.

---

## Risco esperado

| Dimensão | Avaliação | Notas |
|----------|-----------|-------|
| **Geral** | **Baixo** | Migration 100% additive; `IF NOT EXISTS` / colunas nullable |
| **Downtime** | **Nenhum** | `ADD COLUMN` nullable em tabelas pequenas (4 trips, 1 trip_financial) |
| **Dados existentes** | **Sem perda** | Nenhum UPDATE/DELETE |
| **RLS regressão em `trips`** | **Baixo** | 0041 não altera políticas de `trips` |
| **RLS `trip_financials`** | **Inalterado** | Continua sem RLS (estado pré-existente; advisor já reportava) |
| **Deploy código antes da migration** | **Alto** | App que grava `km_billable` falha se 0041 não aplicada |
| **Migration antes do deploy código** | **Baixo** | Colunas extra ignoradas por código antigo |

**Ordem recomendada pós-aprovação:** `db:push` → validação → deploy código pricing → seed regra Comexport.

---

## Impacto no MVP

| Área | Impacto |
|------|---------|
| **Pricing Engine** | Desbloqueia fundação: regras por cliente, km faturável, metadados |
| **Operação actual** | **Nenhum** até deploy do código + seed de regras |
| **Corridas existentes** | Colunas novas ficam `NULL`; financials actuais intactos |
| **API `/api/pricing/rules`** | Requer migration + deploy |
| **Conclusão de corrida** | `applyTripPricingOnCompletion` só activo após deploy |

Classificação: **MVP crítico** (infra de precificação), **zero impacto operacional imediato** só com a migration isolada.

---

## Rollback strategy

**Não existe migration `down` automática no repo.**

### Cenário A — migration aplicada, código ainda não deployado

- **Acção:** nenhuma urgente; colunas nullable não afectam app actual.

### Cenário B — rollback completo necessário

Executar manualmente no SQL Editor (requer aprovação explícita):

```sql
-- ORDEM: políticas → colunas → tabela → tipo
DROP POLICY IF EXISTS pricing_rules_tenant_read ON pricing_rules;
DROP POLICY IF EXISTS pricing_rules_tenant_write ON pricing_rules;

ALTER TABLE trips
  DROP COLUMN IF EXISTS calculation_metadata,
  DROP COLUMN IF EXISTS pricing_rule_id,
  DROP COLUMN IF EXISTS km_billable;

ALTER TABLE trip_financials
  DROP COLUMN IF EXISTS calculation_metadata,
  DROP COLUMN IF EXISTS pricing_rule_id;

DROP TABLE IF EXISTS pricing_rules;
DROP TYPE IF EXISTS pricing_calculation_type;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '0041';
```

**Pré-condições para rollback seguro:**

- Nenhuma linha em `pricing_rules` (ou backup exportado)
- Nenhum `trips.pricing_rule_id` preenchido
- Código pricing desactivado / revertido no deploy

**Risco do rollback:** baixo se feito antes de dados de pricing em produção.

---

## Checklist pré-execução

- [ ] Dry-run confirma **apenas** `0041_pricing_rules.sql`
- [ ] Backup / snapshot Supabase confirmado (Dashboard → Backups)
- [ ] Janela acordada (opcional; migration é rápida)
- [ ] Equipa informada: sem deploy pricing antes da migration

## Checklist pós-execução

- [ ] `npm run db:validate-pricing-0041` → **PASS**
- [ ] `npx supabase migration list --linked` → 0041 local = remote
- [ ] Advisors: confirmar `pricing_rules` com RLS + 2 policies (opcional)
- [ ] `npm run seed:staging` (regra Comexport) — após deploy código
- [ ] Teste: concluir corrida 12 km → `km_billable = 20` (Comexport)

---

## O que NÃO fazer nesta fase

- ❌ `npm run db:push` sem `CONFIRM=1` / aprovação
- ❌ Commit / deploy
- ❌ Seed de pricing antes da validação
- ❌ Rollback SQL sem aprovação

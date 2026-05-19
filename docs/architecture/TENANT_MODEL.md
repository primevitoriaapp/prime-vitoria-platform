# Tenant Model

## Conceito

- **Tenant** = organização (empresa) isolada na plataforma.
- **Prime Vitória** = tenant âncora do MVP (`a0000000-0000-0000-0000-000000000001` no seed de staging).
- **White-label futuro** = mesmo código, branding e domínio por tenant.

## Entidades com `tenant_id` (padrão)

Incluir `tenant_id` em toda tabela que armazena dados de negócio da organização:

- `profiles`, `clients`, `drivers`, `vehicles`, `trips`
- Financeiro: `accounts_receivable`, `driver_payables`, `financial_closings`, …
- Jobs: `notification_jobs`, `erp_sync_jobs`, …
- Notificações in-app, auditoria, etc.

Migração base multiempresa: `0006_multiempresa_tenants.sql`, RLS: `0007_rls_tenant_scope_trips_realtime.sql` e sucessivas.

## Resolução de tenant na sessão

1. Utilizador autentica (Supabase).
2. `profiles` fornece `tenant_id` + `role`.
3. API: `assertTenantScope(session)` → `tenantId` para queries.
4. RLS no Postgres reforça o mesmo isolamento.

## White-label ready (preparado, UX depois)

Tabela alvo futura (não criada no MVP):

```sql
-- conceitual — fase 4
tenant_settings (
  tenant_id uuid primary key references tenants(id),
  brand_name text,
  logo_url text,
  primary_color text,
  custom_domain text,
  smtp_config jsonb,
  feature_flags jsonb
)
```

| Configuração | MVP | Futuro |
|--------------|-----|--------|
| Logo / cores | Default global | `tenant_settings` |
| Domínio customizado | Vercel único | Por tenant |
| SMTP próprio | Plataforma | Por tenant |
| Feature flags | Env global | Por tenant |

## Portal corporativo (cliente)

- Utilizador `cliente` com `profiles.client_id` → escopo `trip.read.own`.
- Centros de custo, aprovação interna, recorrência: **fases posteriores**; schema parcial já prevê `cost_centers`, `requesters` em `0001_init.sql`.

## Staging e testes

- Seed: `scripts/seed-staging-operational.mjs` (idempotente, exige `STAGING_SEED_ENABLED=true`).
- Nunca correr seed contra produção sem decisão explícita.

## Riscos mitigados

- Dados de empresa A em empresa B → `tenant_id` + RLS obrigatórios.
- Customização prematura → settings documentados, schema adiado.

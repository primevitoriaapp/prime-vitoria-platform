# Auditoria RLS — ciclo noite (read-only prep)

> **Não aplicado em produção.** Migration `0042` contém apenas índices. Políticas RLS adicionais ficam documentadas para aprovação.

## Tabelas críticas

| Tabela | RLS | Políticas | Risco | Acção recomendada |
|--------|-----|-----------|-------|-------------------|
| `trips` | ✅ | 4 (admin/operador, cliente, motorista, financeiro read) | Baixo | Manter |
| `pricing_rules` | ✅ | 2 (read/write tenant roles) | Baixo | Manter |
| `trip_financials` | ❌ | 0 | **Alto** (advisor Supabase) | Migration futura `0043` com policies tenant-scoped |
| `profiles` | ❌ | 0 | Médio | API-only hoje; RLS fase posterior |
| `drivers` | ✅ | 0 policies (enabled, no policy) | Médio | Adicionar policies ou desactivar RLS até definir |
| `driver_push_tokens` | ✅ | motorista own-row | Baixo | Manter |

## Regressão pós-0041

Validado em ciclo anterior: `trips` mantém 4 políticas; `pricing_rules` com 2 políticas após `0041`.

## Índices performance (0042)

- `idx_trips_tenant_status_scheduled` — listagens por tenant + estado + agenda
- `idx_trips_tenant_driver_active` — painel motorista (corridas activas)
- `idx_trip_financials_pricing_rule` — joins pós-pricing

## Tenant isolation

- APIs: `assertTenantScope(session)` em rotas autenticadas
- Testes: `tests/tenant-isolation.test.ts`
- Smoke staging: `scripts/e2e-staging-all-roles.mjs`

## RBAC granular (prep)

- `src/lib/security/capabilities.ts` — registo central + capabilities planeadas (`pricing.read`, `pricing.write`)
- Rotas pricing actuais usam `finance.read` / `finance.write` (MVP estável)

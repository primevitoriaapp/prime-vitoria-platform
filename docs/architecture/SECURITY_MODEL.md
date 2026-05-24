# Security Model

## Postura

**Defense in depth:** Supabase RLS é a última linha; a API aplica RBAC e `tenant_id` em toda leitura/escrita. O frontend nunca é fonte de verdade para autorização.

## Multi-tenant

- Cada organização = linha em `tenants`.
- Perfis (`profiles.tenant_id`) ligam utilizadores a uma organização.
- Tabelas operacionais/financeiras relevantes incluem `tenant_id NOT NULL`.
- APIs usam `assertTenantScope(session)` antes de queries.

### Checklist para nova tabela multiempresa

1. Coluna `tenant_id uuid NOT NULL REFERENCES tenants(id)`.
2. Políticas RLS: `USING (tenant_id = current_tenant_from_jwt())` (padrão do projeto nas migrações `0006`, `0007`, etc.).
3. Índices compostos começando por `tenant_id` quando houver listagens frequentes.
4. Rotas API: filtrar sempre por `tenant_id` da sessão.
5. Teste: utilizador do tenant A não acede dados do tenant B.

### Tenant leakage (estado e meta)

| Item | Estado |
|------|--------|
| RLS em tabelas core | Implementado (migrações incrementais) |
| Escopo em rotas Next | Implementado (`tenant-scope`) |
| Testes automatizados de leakage | **Em progresso** — `tests/tenant-isolation.test.ts`, `capabilities.ts` |
| Smoke staging por papel | Implementado (`scripts/e2e-staging-auth.mjs`) |

## Autenticação

- Supabase Auth (email/senha; extensível a SSO futuro).
- Sessão server-side via `getSessionContext()` (perfil + role + tenant).
- Jobs máquina: secrets (`NOTIFICATION_JOB_PROCESS_SECRET`, `ERP_JOB_PROCESS_SECRET`, `RECONCILE_JOB_PROCESS_SECRET`, `CRON_SECRET`) — configurar em produção ([GO_LIVE_RUNBOOK.md](../GO_LIVE_RUNBOOK.md)).

## RBAC

Capabilities em [RBAC_MATRIX.md](./RBAC_MATRIX.md). Rotas chamam `assertCapability` antes de lógica sensível.

## Auditoria

- `audit_events`: ações relevantes (financeiro, integrações, operações).
- Leitura restrita a papéis com escopo (admin/operador/financeiro conforme migração `0021`).
- Timeline operacional combina auditoria + notas + histórico de status (visão global: admin/operador; financeiro sem notas internas).

## LGPD (ready)

| Requisito | Abordagem |
|-----------|-----------|
| Minimização | Campos opcionais; sem dados desnecessários em logs |
| Isolamento | Tenant + RLS |
| Rastreabilidade | `audit_events`, `trip_status_history` |
| Retenção / exclusão | **Fase posterior** — políticas por tenant e anonimização |
| DPO / bases legais | Processo organizacional (fora do código) |

## Rate limiting e integrações

- Guards em rotas de integração (`runIntegrationGuards`).
- Webhooks: verificação de assinatura HMAC (`tests/webhook-auth.test.ts`).

## Deployment

- Secrets apenas em Vercel/Supabase; nunca commitar `.env*`.
- Deployment Protection na Vercel: smoke público via alias ou bypass de automação.

## Riscos mitigados

- Acesso cross-tenant em API → tenant scope obrigatório.
- Elevação de privilégio por role → capabilities explícitas + testes RBAC.
- Jobs expostos → Bearer secret + capability quando sessão humana.

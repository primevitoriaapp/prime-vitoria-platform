# Architecture Document

## Objetivo

Plataforma SaaS multiempresa para operação de transporte executivo (Prime Vitória como tenant âncora), com caminho para white-label e portal corporativo, **sem travar o go-live**.

## Princípios (ordem de decisão)

1. **MVP first** — priorizar agenda, OS/corrida, despacho, motorista, rastreio, finalização, financeiro básico, portal cliente.
2. **Security first** — isolamento por `tenant_id` + RLS; nunca confiar só no frontend.
3. **Incremental** — evoluir o que existe; sem rewrite massivo.
4. **Future ready** — preparar extensões (offline, checklist, white-label) sem implementar tudo agora.
5. **Documentação obrigatória** — manter esta pasta atualizada a cada etapa relevante.

## Stack atual

| Camada | Tecnologia |
|--------|------------|
| UI / App Router | Next.js (React), painéis admin/operador/financeiro/motorista/cliente |
| API | Route Handlers em `src/app/api/**` |
| Auth | Supabase Auth + sessão em `getSessionContext()` |
| Dados | Supabase Postgres + RLS |
| Jobs / integrações | Filas em DB (`notification_jobs`, `erp_sync_jobs`), crons Vercel |
| Deploy | Vercel (`prime-vitoria-web`) |

## Camadas lógicas

```
┌─────────────────────────────────────────────────────────┐
│  UI (pages, components)                                  │
├─────────────────────────────────────────────────────────┤
│  API routes — validação Zod, RBAC, tenant scope         │
├─────────────────────────────────────────────────────────┤
│  Domain libs — finance, trips, dispatch, integrations    │
├─────────────────────────────────────────────────────────┤
│  Supabase — Postgres + RLS + Realtime (onde aplicável)  │
└─────────────────────────────────────────────────────────┘
```

## Estado atual (baseline)

- **Multi-tenant:** `tenants`, `tenant_id` em entidades principais; escopo em API via `assertTenantScope`.
- **RBAC:** capabilities por papel em `src/lib/security/rbac.ts`; testes em `tests/erp-rbac.test.ts`.
- **FSM operacional:** enum Postgres `trip_operational_status` (ver [FSM_FLOW.md](./FSM_FLOW.md)); histórico em `trip_status_history`.
- **Auditoria:** `audit_events` com escopo tenant.
- **Financeiro:** `trip_financials`, contas a receber/pagar, fechamentos, DRE resumido.
- **Integrações:** ERP sync, webhooks, reconciliação, notificações push/in-app.
- **Staging:** seed idempotente + E2E por papel (`docs/STAGING_E2E.md`).

## Evolução planejada (não bloqueia MVP)

| Área | Preparação | Implementação completa |
|------|------------|------------------------|
| Capabilities granulares | Matriz alvo em RBAC_MATRIX | Fase 2+ — claims JWT |
| FSM detalhada (embarque, checklist) | Documento alvo + regras | Fase 2+ motorista |
| Offline-first motorista | Contratos sync queue (doc) | Fase 3 PWA |
| White-label | `tenant_settings` (schema futuro) | Fase 4 |
| Tenant leakage tests | Casos em SECURITY_MODEL | Automatizar em CI |

## Convenções de código

- Lógica pura e validação em `src/lib/**` com testes em `tests/`.
- Rotas finas: sessão → capability → tenant → query/ mutation.
- Migrações numeradas em `supabase/migrations/`; nunca alterar migrações já aplicadas em produção.
- Alterações operacionais: um ciclo = implementar → testar → documentar (`IMPLEMENTATION_SUMMARY`) → commit.

## Riscos mitigados pela fundação

| Risco | Mitigação atual |
|-------|-----------------|
| Vazamento entre empresas | `tenant_id` + RLS + assert em API |
| Permissão incorreta | `assertCapability` centralizado |
| Estado operacional inconsistente | Enum DB + histórico + regras em rotas de transição |
| Retrabalho white-label | Modelo tenant documentado antes de customização UX |

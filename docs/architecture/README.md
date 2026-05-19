# Arquitetura Prime Vitória Platform

Documentação viva da evolução arquitetural do produto. Objetivo: **MVP operacional rápido + fundação enterprise desde o início**, sem rewrite.

## Diretriz

> MVP operacional rápido + arquitetura forte desde a fundação.

## Documentos

| Documento | Conteúdo |
|-----------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Visão geral, camadas, princípios e estado atual |
| [SECURITY_MODEL.md](./SECURITY_MODEL.md) | Multi-tenant, RLS, auditoria, LGPD |
| [RBAC_MATRIX.md](./RBAC_MATRIX.md) | Papéis, capabilities e evolução JWT |
| [FSM_FLOW.md](./FSM_FLOW.md) | Máquinas de estado (atual vs alvo) |
| [TENANT_MODEL.md](./TENANT_MODEL.md) | Modelo multiempresa e white-label |
| [ROADMAP_PHASES.md](./ROADMAP_PHASES.md) | Fases de entrega (MVP → escala) |

## Relacionados

- [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md) — changelog técnico por ciclo
- [GO_LIVE_RUNBOOK.md](../GO_LIVE_RUNBOOK.md) — deploy e validação
- [STAGING_E2E.md](../STAGING_E2E.md) — smoke autenticado em staging

## Como usar

1. Antes de features novas: verificar **ROADMAP_PHASES** (prioridade MVP) e **RBAC_MATRIX** / **SECURITY_MODEL**.
2. Mudanças de estado operacional: atualizar **FSM_FLOW** e testes de transição.
3. Novas tabelas multiempresa: seguir **TENANT_MODEL** + migração RLS.
4. Ao fechar cada etapa: registrar em **IMPLEMENTATION_SUMMARY** o que foi feito, preparado, adiado e riscos mitigados.

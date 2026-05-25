# Roadmap por Fases

> **Modo actual:** [MVP_OPERATIONAL_MODE.md](../MVP_OPERATIONAL_MODE.md) — estabilidade operacional, UX real e FCM acima de expansão arquitectural.

Prioridade absoluta: **Prime Vitória operando** na sequência abaixo. Arquitetura forte é transversal, entregue em fatias pequenas.

## Prioridade de produto (MVP)

| # | Entrega | Estado referência |
|---|---------|-------------------|
| 1 | Agenda funcional | Painéis agenda existentes |
| 2 | Criar nova corrida/OS | API + UI viagem |
| 3 | Central de despacho | Dispatch / fila |
| 4 | Motorista aceitar corrida | `trip.accept`, status |
| 5 | Rastreamento básico | `driver_locations`, TRACKING.md |
| 6 | Finalização operacional | `completed`, pós-viagem |
| 7 | Financeiro básico | Recebíveis, pagáveis, DRE |
| 8 | Portal corporativo cliente | Papel `cliente`, viagens próprias |

Nada nas fases 2–4 abaixo deve atrasar esta lista sem decisão explícita.

---

## Fase 0 — Go-live Prime Vitória (atual)

**Objetivo:** produção estável com segurança baseline.

| Entrega | Status |
|---------|--------|
| Multi-tenant + RLS core | Feito |
| RBAC capabilities | Feito |
| Deploy Vercel + smoke | Feito |
| Seed + E2E staging | Feito |
| Secrets cron/jobs em produção | Pendente manual |
| Migrações Supabase prod | `0041` aplicada; `0042` índices pendente push |

**Preparado para futuro:** documentação em `docs/architecture/`.

**Depende depois:** testes automatizados tenant leakage; FSM centralizada.

**Riscos mitigados:** isolamento tenant; smoke por papel; histórico operacional sem coluna inexistente.

---

## Fase 1 — Consolidação operacional MVP

**Objetivo:** fechar lacunas da sequência MVP 1–6 sem redesign.

| Item | Status |
|------|--------|
| Transições endurecidas (reatribuição + plano multi-passo) | Feito — `planOperationalTransition`, reassign multi-passo |
| Cancelamento portal cliente | Feito — API + UI + E2E staging |
| Portal: solicitar + acompanhar + rastreio | Feito (base existente) |
| Despacho + push FCM em produção | Parcial — crons/jobs OK; falta `FCM_SERVER_KEY` (Firebase) |
| Índices fila/despacho | Feito — `0014` + `0040_operations_queue_index` |
| E2E motorista aceite + bloqueio transição inválida | Feito — seed `dispatched` + smoke |

**Preparado:** matriz RBAC e FSM documentadas; testes de transição.

**Adiado:** offline PWA, checklist, white-label UX.

---

## Fase 2 — FSM + RBAC granular

**Objetivo:** regras de negócio explícitas e auditáveis.

- Módulo `tripFsm` com transições testadas.
- Novos estados finos (mapeamento desde enum atual).
- Bloqueios: documentação motorista, embarque sem checklist.
- Aliases capabilities `rides.*` / `financial.*` sem quebrar APIs.
- JWT claims `capabilities[]` (opcional).

**Preparado agora:** [FSM_FLOW.md](./FSM_FLOW.md), [RBAC_MATRIX.md](./RBAC_MATRIX.md).

**Riscos mitigados:** estados inválidos; permissões ambíguas.

---

## Fase 3 — Motorista avançado + offline foundation

**Objetivo:** experiência motorista resiliente.

- Checklist pré/pós viagem, despesas, comprovantes, emergência.
- Contrato sync queue + retries (sem UX final = só lib + API idempotente).
- PWA offline: background sync quando suportado.

**Adiado:** chat operação, agenda motorista rica.

---

## Fase 4 — Cliente corporativo + white-label

**Objetivo:** SaaS multi-marca e self-service B2B.

- Centros de custo, recorrência, aprovação interna, relatórios, faturamento.
- `tenant_settings` + domínio customizado + SMTP.
- Múltiplos utilizadores por cliente.

---

## Fase 5 — Escala e observabilidade

- Testes tenant leakage em CI.
- Realtime otimizado (evitar polling).
- Métricas, tracing, SLOs.
- Revisão de índices compostos sob carga.

---

## Template de fecho de etapa

Ao concluir qualquer entrega, preencher o **relatório de fechamento de ciclo** (12 itens) definido em [CYCLE_CLOSURE_TEMPLATE.md](../CYCLE_CLOSURE_TEMPLATE.md) — referência canónica do modelo.

Registar o relatório preenchido em [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md) (uma secção por ciclo).

> **Regra:** alterações destrutivas (drop de coluna/tabela, truncate, reset de dados, `force` push, rollback irreversível) **só** com confirmação explícita do utilizador.

**Checklist (12 itens):**

1. O que foi alterado
2. Quais arquivos foram modificados
3. Impacto da mudança
4. Risco de regressão (baixo/médio/alto)
5. Precisa migration? (sim/não)
6. Precisa db:push? (sim/não)
7. Precisa deploy? (sim/não)
8. O que ficou pendente
9. Recomendação de próximo passo
10. Status do GitHub/Vercel/Supabase
    - branch atual
    - commit hash
    - Vercel alinhado? (sim/não)
    - Supabase alinhado? (sim/não)
11. Impacto no MVP
    - MVP crítico | melhoria operacional | infraestrutura | preparação futura
12. Testado?
    - [ ] local / [ ] staging / [ ] produção

## Offline-first (foundation only — Fase 3)

| Peça | Descrição |
|------|-----------|
| Fila local | Operações idempotentes com `clientMutationId` |
| Sync | POST batch + reconciliação de conflitos |
| API | Endpoints aceitam replay; timestamps servidor |
| UX | Placeholder até PWA |

Documentar contratos em código quando iniciar Fase 3; não implementar UI offline no MVP.

# Roadmap por Fases

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
| Migrações Supabase prod | Verificar `db:push` |

**Preparado para futuro:** documentação em `docs/architecture/`.

**Depende depois:** testes automatizados tenant leakage; FSM centralizada.

**Riscos mitigados:** isolamento tenant; smoke por papel; histórico operacional sem coluna inexistente.

---

## Fase 1 — Consolidação operacional MVP

**Objetivo:** fechar lacunas da sequência MVP 1–6 sem redesign.

- Endurecer transições de status nas APIs existentes.
- Despacho + notificações push estáveis em produção (FCM secret).
- Índices e queries de fila/despacho (já iniciado em `0014`).
- Portal cliente: solicitar viagem + acompanhar status.

**Preparado:** matriz RBAC e FSM documentadas.

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

Ao concluir qualquer entrega, registar em [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md):

1. **Implementado** — o que entrou em produção/código.
2. **Preparado** — fundação para fases futuras.
3. **Adiado** — explicitamente fora deste ciclo.
4. **Riscos mitigados** — segurança, dados, operação.

## Offline-first (foundation only — Fase 3)

| Peça | Descrição |
|------|-----------|
| Fila local | Operações idempotentes com `clientMutationId` |
| Sync | POST batch + reconciliação de conflitos |
| API | Endpoints aceitam replay; timestamps servidor |
| UX | Placeholder até PWA |

Documentar contratos em código quando iniciar Fase 3; não implementar UI offline no MVP.

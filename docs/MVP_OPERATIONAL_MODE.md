# Modo MVP operacional — Prime Vitória

> **Fase actual (2026-05):** a fundação técnica é suficiente. Prioridade = **operação real**, usabilidade e estabilidade — não expansão infinita de arquitetura.

## Estado de referência (baseline)

| Área | Estado |
|------|--------|
| Núcleo operacional | Funcional (agenda, despacho, transições, financeiro base) |
| Pricing Comexport | Validado (`km_with_minimum`, mín. 20 km, flags OFF) |
| Multi-tenant + RLS | Estáveis para o estágio MVP |
| Portal cliente | Read-only por defeito (`/client`) |
| PWA motorista | Em evolução contínua |
| CI / testes | Maduros para o estágio (unit + Playwright + smoke scripts) |
| Regressões críticas | Nenhuma detectada na última entrega |

## Princípio estratégico

**A engenharia serve a operação — não o contrário.**

Objectivo: sistema **utilizável no dia-a-dia** da Prime Vitória (operador, motorista, cliente corporativo).

## Prioridades dos próximos ciclos (ordem)

### 1. Operação real / smoke humano

- Fluxo **operador** (criar → despachar → acompanhar)
- Fluxo **motorista** (aceitar → estados → concluir)
- Fluxo **cliente** (consulta read-only → detalhe → timeline)
- Simulações de corrida reais (staging, não prod)
- Reduzir cliques e atrito (CTAs, confirmações só onde importa)

**Entregáveis típicos:** [OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md), [OPERATIONAL_FRICTION_LOG.md](./OPERATIONAL_FRICTION_LOG.md), E2E staging por papel.

### 2. Push / FCM (prioridade operacional)

- Recepção rápida de corridas no motorista
- Updates em tempo real (complementar Supabase Realtime)
- Experiência PWA motorista com notificação confiável

**Dependência humana:** `docs/FIREBASE_FCM_SETUP.md`, secrets Vercel (sem alterar secrets no repo).

### 3. Portal cliente (seguro)

- Manter **read-only por defeito** (`NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY` só `false` com decisão)
- Melhorar consulta e acompanhamento (UX corporativa, menos ruído)
- Evitar faturamento / writes complexos até operação validar necessidade

### 4. UX motorista

- Estados grandes, legíveis, poucos toques
- Timeline + CTA próximo passo + feedback visual
- Mobile / PWA first; menos erro humano (confirmações em terminais)

### 5. Hardening sem paralisar

- Logs, observabilidade, testes, RBAC, RLS, performance — **em fatias pequenas**
- Sem redesign, sem migrações destrutivas, sem flags ON por defeito
- Comexport runtime **intocado** salvo bugfix com teste

## Regras inegociáveis (continuam)

| Regra | |
|-------|---|
| Deploy produção | Só com aprovação explícita |
| Merge `main` | Só com aprovação explícita |
| `db:push` | Só com aprovação explícita |
| Alterações destrutivas | Proibidas sem confirmação |
| Feature flags pricing | OFF por defeito |
| Runtime Comexport | Não quebrar |

## Branch e PR de trabalho

- Integração contínua em `cursor/pricing-engine-mvp-cycle` (ou branch `cursor/*` acordada)
- PR draft: ver GitHub; smoke preview quando `VERCEL_AUTOMATION_BYPASS_SECRET` disponível

## Critério de “pronto para operação real”

1. Operador consegue ciclo completo em staging sem workaround manual crítico  
2. Motorista recebe corrida (push ou fila visível) e fecha estados sem ambiguidade  
3. Cliente consulta corrida e estado sem writes acidentais  
4. Pricing de corrida piloto bate expectativa Comexport (testes + amostra real)  
5. Smoke humano documentado com PASS ou blockers explícitos  

## Documentos relacionados

- [MVP_GO_LIVE_CHECKLIST.md](./MVP_GO_LIVE_CHECKLIST.md) — gate produção (ainda protegido)
- [BLOCKERS_AND_NEXT_ACTIONS.md](./BLOCKERS_AND_NEXT_ACTIONS.md) — blockers e ordem de acções
- [CLIENT_PORTAL_WIREFRAME.md](./CLIENT_PORTAL_WIREFRAME.md) — evolução portal
- [FCM_PWA_READINESS.md](./FCM_PWA_READINESS.md) — push motorista
- [STAGING_E2E.md](./STAGING_E2E.md) — E2E autenticado
- [architecture/ROADMAP_PHASES.md](./architecture/ROADMAP_PHASES.md) — fases longas

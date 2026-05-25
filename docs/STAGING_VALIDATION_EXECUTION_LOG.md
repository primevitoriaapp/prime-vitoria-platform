# Registo de execução — Validação staging (oficial)

> **Única fonte de verdade** para decisões de código no [modo validação operacional humana](./MODO_VALIDACAO_OPERACIONAL_HUMANA.md).  
> **Engenharia em espera:** nenhum ciclo relevante até existir PASS/FAIL + P0/P1 reais abaixo.  
> Correcções futuras: **só P0/P1** deste ficheiro — sem features, módulos, redesign, `db:push`, prod, `main`, portal write, pricing novo.

---

## Próximos passos oficiais (sessão humana — executar agora)

| # | Passo | Referência |
|---|--------|------------|
| 1 | Firebase/Vercel configurado | [FIREBASE_FCM_SETUP.md](./FIREBASE_FCM_SETUP.md) |
| 2 | Preflight | `npm run staging:validation-preflight` |
| 3 | Quick start | `npm run staging:smoke-quickstart` |
| 4 | Smoke operacional | [OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md) |
| 5 | Smoke FCM | [FCM_OPERATIONAL_SMOKE.md](./FCM_OPERATIONAL_SMOKE.md) |
| 6 | **Registo** | Preencher template ↓ neste ficheiro |

**Corrida oficial:** `c2000000-0000-4000-8000-000000000001` (requested)

**Ciclo a validar:** operador → motorista → cliente → push → pricing Comexport → finalização

**Observar:** cliques · lentidão · confusão · timeline · mensagens · push/refresh · workarounds

**FAIL operacional se:** UUID manual · API/consola · refresh excessivo · workaround crítico

**MVP pronto quando:** despacho natural · motorista sem confusão · cliente entende estado · push mínimo · Comexport OK · sem workarounds → então piloto/rollout gradual.

---

## Execução (template — copiar bloco)

```markdown
### Execução YYYY-MM-DD — [tester]

| Campo | Valor |
|-------|--------|
| Ambiente | `https://...` (preview/staging) |
| Branch / commit | `cursor/pricing-engine-mvp-cycle` @ `________` |
| Início | HH:MM |
| Fim | HH:MM |
| Duração total | __ min |

#### Automatizado (pré-browser)

| Check | Resultado |
|-------|-----------|
| `staging:validation-preflight` | PASS / FAIL |
| `staging:validation-automated` | PASS / FAIL / N/A |

#### Smoke operacional ([OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md))

| Grupo | Resultado | Notas |
|-------|-----------|-------|
| G1–G5 global | PASS / FAIL | |
| Operador O1–O7 | PASS / FAIL | cliques ~__ |
| Motorista M1–M7 | PASS / FAIL | |
| Cliente C1–C7 | PASS / FAIL | read-only |

#### Smoke FCM ([FCM_OPERATIONAL_SMOKE.md](./FCM_OPERATIONAL_SMOKE.md))

| Grupo | Resultado | Notas |
|-------|-----------|-------|
| F1–F9 global | PASS / FAIL / N/A (sem secrets) | |
| Push recebido no dispositivo | sim / não | |
| Fallback F9 sem FCM | PASS / FAIL | |

#### Pricing Comexport

| Check | Resultado |
|-------|-----------|
| 12 km → 20 km facturáveis | PASS / FAIL |
| Valor conferido na UI/API | R$ __ |

#### Workarounds usados (FAIL se crítico)

- [ ] Nenhum
- [ ] Consola UUID `/dispatch`
- [ ] API HTTP manual
- [ ] Outro: _______________

#### Atritos novos (prioridade)

| P | Descrição | Papel |
|---|-----------|-------|
| | | |

#### Decisão

- [ ] **MVP operacional pronto** — pode discutir rollout prod
- [ ] **Repetir smoke** após correcções (listar commits/PR)
```

---

## Estado actual

| Campo | Valor |
|-------|--------|
| Modo | **Validação operacional humana real** |
| Branch | `cursor/pricing-engine-mvp-cycle` estabilizada |
| Engenharia | **Suporte** — sem ciclos grandes até registo abaixo |
| Execuções registadas | **0** |
| Código pendente | **Nenhum** até P0/P1 no log |
| Próxima acção | Tabela «Próximos passos oficiais» ↑ |

---

## Histórico

_(Substituir o template acima por entradas reais após cada sessão.)_

| Data | Tester | Operacional | FCM | Pricing | MVP pronto? |
|------|--------|-------------|-----|---------|-------------|
| | | | | | |

---

## Última decisão arquitectural

| Data | Decisão |
|------|---------|
| 2026-05-24 | Foco absoluto: execução humana staging antes de novas features |

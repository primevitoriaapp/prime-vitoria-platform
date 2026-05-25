# Registo de execução — Validação staging (oficial)

> **Fonte de verdade** para o [modo validação operacional humana](./MODO_VALIDACAO_OPERACIONAL_HUMANA.md).  
> Os próximos ciclos de código corrigem **apenas P0/P1** documentados aqui.  
> Preencher após cada sessão de smoke humano + FCM.

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

# Modo validação operacional humana — Prime Vitória

> **Estado oficial do projecto.** Entrada em vigor: decisão de produto pós-ciclos agenda/FCM/docs.  
> Até ao primeiro **PASS** registado em [STAGING_VALIDATION_EXECUTION_LOG.md](./STAGING_VALIDATION_EXECUTION_LOG.md), **não** se discute rollout de produção.

---

## O que validamos (não o que construímos)

| Dimensão | Pergunta |
|----------|----------|
| Clareza | O operador/motorista/cliente percebe o estado actual sem adivinhar? |
| Velocidade | Quantos cliques até despacho, aceite e finalização? |
| Confiança | Timeline e status batem certo com a realidade? |
| Experiência real | Funciona em mobile/PWA e no dia-a-dia simulado? |
| Sem workaround crítico | Consegue-se fechar a corrida **sem** UUID console nem API manual? |

**Não é prioridade:** novas funcionalidades, módulos grandes, redesign, ERP complexo, CarPlay, pricing novo, portal write, produção.

---

## Fonte de verdade para decisões

**[STAGING_VALIDATION_EXECUTION_LOG.md](./STAGING_VALIDATION_EXECUTION_LOG.md)**

- Cada sessão de smoke → uma entrada com PASS/FAIL, tempos, atritos P0–P3, workarounds.
- Código só muda em resposta a **P0/P1 reais** documentados no log.
- P2/P3 entram em backlog até haver capacidade após MVP operacional pronto.

---

## Primeiro ciclo real a fechar

```
operador → motorista → cliente → push → pricing Comexport → finalização
```

| Papel | Roteiro |
|-------|---------|
| Operador + motorista + cliente | [OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md) |
| Push / FCM | [FCM_OPERATIONAL_SMOKE.md](./FCM_OPERATIONAL_SMOKE.md) |
| Ordem + scripts | [STAGING_VALIDATION_RUNBOOK.md](./STAGING_VALIDATION_RUNBOOK.md) |

---

## Regras dos próximos ciclos de engenharia

| Permitido | Proibido (sem aprovação explícita) |
|-----------|-------------------------------------|
| Fix P0/P1 do EXECUTION_LOG | Módulos novos grandes |
| Mensagens, labels, 1 clique a menos | Redesign arquitectural |
| Loading / empty / erro visível | Portal cliente write-mode |
| Push/notificação se FAIL no FCM smoke | Pricing complexo novo |
| Timeline/status se inconsistente | `db:push` 0042/0043 |
| Testes que espelham o smoke | Deploy produção, merge `main` |

**Comexport:** runtime e flags OFF **intocados** salvo bugfix com teste e entrada no log.

---

## Critério “MVP operacional pronto”

Registo no EXECUTION_LOG com:

- [ ] Fluxo fluido (G1–G5 PASS)
- [ ] Sem workaround crítico documentado
- [ ] Push minimamente confiável (F1–F8 PASS ou F9 fallback aceite para piloto)
- [ ] Pricing Comexport correcto na corrida de teste
- [ ] Timeline compreensível (G4)
- [ ] Operação confortável (notas do tester)

**Então:** discussão de [rollout controlado](./MVP_GO_LIVE_CHECKLIST.md) — não antes.

---

## Papel da engenharia

**Suporte à operação humana:**

1. Manter runbooks e scripts de preflight actualizados.
2. Corrigir atritos reais em PRs pequenos na branch de integração.
3. Não antecipar produto além do que o smoke pedir.

Branch de trabalho habitual: `cursor/pricing-engine-mvp-cycle` (PR #2).

---

## Comandos de apoio (não substituem o browser)

```bash
npm run staging:validation-preflight
npm run staging:validation-automated   # pricing + APIs; requer Supabase no shell
```

---

## Documentos relacionados

- [MVP_OPERATIONAL_MODE.md](./MVP_OPERATIONAL_MODE.md) — contexto estratégico
- [OPERATIONAL_FRICTION_LOG.md](./OPERATIONAL_FRICTION_LOG.md) — atritos já conhecidos no código
- [BLOCKERS_AND_NEXT_ACTIONS.md](./BLOCKERS_AND_NEXT_ACTIONS.md) — dependências externas

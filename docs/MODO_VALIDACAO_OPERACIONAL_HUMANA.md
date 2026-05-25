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

## Regras absolutas (ciclos actuais)

Sem deploy produção · sem merge `main` · sem `db:push` · sem migrations novas · sem módulos grandes · sem redesign · sem portal write · sem pricing novo · sem CarPlay · Comexport runtime intocado.

## Regras dos próximos ciclos de engenharia

| Permitido (prioridade) | Proibido |
|------------------------|----------|
| 1. Fix P0/P1 do EXECUTION_LOG | Módulos novos grandes |
| 2. Velocidade operacional (menos cliques) | Redesign arquitectural |
| 3. Atrito humano / clareza visual | Portal cliente write-mode |
| 4. Confiança (timeline, status) | Pricing complexo novo |
| 5. Push / realtime / fallback-erro | Migrations, `db:push` |
| Testes que espelham o smoke | Produção, merge `main` |

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

## Princípio de gate (novo)

**Nenhuma funcionalidade relevante entra** sem antes validar em staging:

`operador → motorista → cliente → push → pricing Comexport → finalização`

O código **não lidera**. A operação humana lidera. O [EXECUTION_LOG](./STAGING_VALIDATION_EXECUTION_LOG.md) decide o que entra no código.

**Modo actual:** *acabamento operacional*, não *expansão infinita*.

---

## Papel da engenharia

**Suporte à operação humana:**

1. Manter runbooks e [quick start](./SMOKE_SESSAO_QUICK_START.md) actualizados.
2. Corrigir **apenas P0/P1** do EXECUTION_LOG em PRs pequenos.
3. Priorizar: velocidade · atrito · clareza · confiança · push/realtime · fallback/erros.
4. **Não** antecipar produto além do que o smoke pedir.

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

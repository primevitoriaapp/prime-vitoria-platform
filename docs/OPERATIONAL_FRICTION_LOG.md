# Registo de atritos operacionais — Prime Vitória MVP

> Actualizado no ciclo **smoke humano + redução de atrito** (branch `cursor/pricing-engine-mvp-cycle`).

## Resumo

| Métrica | Valor |
|---------|--------|
| Atritos identificados | 12 |
| Corrigidos neste ciclo | 10 |
| Abertos (P1+) | 2 |
| Roteiro smoke | [OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md) |

---

## Lista priorizada

| P | Atrito | Papel | Correcção | Estado |
|---|--------|-------|-----------|--------|
| **P0** | Reivindicação abaixo de despacho → erro obscuro | Operador | `TripOperationalClaimBar` no topo de `TripAgendaFocusPanel` | ✅ Corrigido |
| **P0** | Fila **Abrir** sem datas → estado errado na agenda | Operador | `buildAgendaTripHref` + fetch API se viagem fora do filtro | ✅ Corrigido |
| **P1** | Link **Notas** / coluna Equipa confunde | Operador | **Abrir** + coluna **Acções** + hint agenda | ✅ Corrigido |
| **P1** | Tabela agenda vazia sem mensagem | Operador | Empty state em `TripTable` | ✅ Corrigido |
| **P1** | Cliente: erro API parece lista vazia | Cliente | `loadError` + **Tentar novamente** | ✅ Corrigido |
| **P1** | Motorista: botão "Próximo: {estado}" | Motorista | Label = `STATUS_CORRIDA_PT[step]` | ✅ Corrigido |
| **P2** | Dispatch expõe API/UUID em destaque | Operador | `<details>` Ferramentas avançadas | ✅ Corrigido |
| **P2** | Motorista sem corridas — sem orientação | Motorista | Texto + **Actualizar** / push | ✅ Corrigido |
| **P2** | Ofertas vazias — UI desaparece | Motorista | Mensagem explícita | ✅ Corrigido |
| **P2** | Cliente read-only sem contexto | Cliente | `ClientPortalReadonlyNotice` | ✅ Corrigido |
| **P2** | Detalhe cliente loading fraco | Cliente | Skeleton no detalhe | ✅ Corrigido |
| **P1** | Cliente não cria corrida (read-only) | Cliente / Smoke | **Workaround:** operador/seed; não é bug | ⏸ Adiado (fase 2) |
| **P1** | Push FCM ausente — motorista depende de refresh | Motorista | Config Vercel/Firebase (humano) | 🔴 Aberto — [FCM_PWA_READINESS.md](./FCM_PWA_READINESS.md) |
| **P2** | Tracking no detalhe cliente só texto | Cliente | Manter read-only; link na lista quando write mode | ⏸ Adiado |
| **P2** | Claim stale sem auto-libertar | Operador | Contactar admin (mensagem existente) | ⏸ Adiado |
| **P3** | Oferta parceiros: muitos cliques | Operador | Simplificar UI ofertas (futuro) | ⏸ Backlog |

---

## Workarounds ainda válidos (não eliminar sem decisão)

1. Criar viagem: API ou seed — portal cliente read-only por política MVP.  
2. `DispatchConsole` — apenas debug, dentro de details.  
3. KM manual — `TripKmPanel` quando trail GPS insuficiente.  
4. `STAGING_SEED_RESET_PASSWORD` — repor passwords de teste.

---

## Próximas correcções sugeridas (ciclos seguintes)

1. **FCM** — desbloquear MB1 operacionalmente (prioridade MVP operacional).  
2. Smoke humano executado em preview com registo na secção 7 do roteiro.  
3. Consolidar **um** CTA "Despachar" quando motorista pré-seleccionado na agenda (reduzir 1 clique).  
4. Auto-refresh motorista após evento Realtime `trips` (já parcial — validar em dispositivo).

---

## Como actualizar este ficheiro

Após cada smoke humano:

1. Marcar PASS/FAIL no roteiro.  
2. Adicionar linhas novas na tabela com prioridade P0–P3.  
3. Mover itens corrigidos para ✅ com referência ao commit.

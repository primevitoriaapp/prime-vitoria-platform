# Portal cliente — wireframe operacional (prep)

> Documento de preparação UX. **Não implementado** neste ciclo — acelera Fase 2.

## Ecrãs

### 1. Dashboard

- Corridas activas (requested → in_progress)
- Últimas concluídas
- CTA: **Nova solicitação**

### 2. Nova solicitação (wizard)

| Passo | Campos |
|-------|--------|
| Origem / destino | texto + mapa opcional |
| Data/hora | `scheduled_at` |
| Passageiro | nome, telefone |
| Centro de custo | dropdown `cost_centers` |
| Tipo serviço | transfer / evento / diária |
| Recorrência | prep: semanal/mensal (flag off) |
| Evento multi-passageiro | lista passageiros (flag off) |

### 3. Detalhe corrida

- Timeline pública (estados)
- Rastreamento (`/r/[token]`) — link partilhável
- Cancelar (se `requested` / `approved`)

### 4. Centro de custos (fase 2)

- Lista CC do cliente
- Filtro histórico por CC

## Fluxo FSM (cliente)

```
requested → (operador) approved → … → completed
requested → cancelled (cliente)
```

## APIs existentes

- `POST /api/trips` (solicitação)
- `GET /api/trips` (own)
- `POST /api/trips/[id]/status` (cancel)

## Flags futuras

- `CLIENT_PORTAL_RECURRENCE=false`
- `CLIENT_PORTAL_MULTI_PASSENGER=false`
- `CLIENT_PORTAL_COST_CENTER=true` (dados já no modelo)

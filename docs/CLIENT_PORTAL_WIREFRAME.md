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

## Rotas planeadas (App Router)

| Rota | Componente (prep) | Papel |
|------|-------------------|-------|
| `/cliente` | `ClientDashboard` | cliente |
| `/cliente/solicitar` | `ClientTripWizard` | cliente |
| `/cliente/corridas/[id]` | `ClientTripDetail` | cliente |
| `/cliente/centros-custo` | `ClientCostCenters` | cliente (fase 2) |
| `/r/[token]` | público (existente) | rastreio |

## Modelo de dados (já no Supabase)

- `trips.client_id`, `cost_center_id` (quando aplicável)
- `clients` corporativos seed (Comexport)
- Filtro tenant + `trip.read.own` em APIs

## Componentes a reutilizar

- `StatusBadge`, timeline operacional (read-only para cliente)
- `fetchWithSupabaseSession` + RBAC `cliente`
- Form solicitação alinhado a `POST /api/trips` schema actual

## Acessibilidade / corporativo

- Contraste WCAG AA em estados de corrida
- Labels PT-BR consistentes (`STATUS_CORRIDA_PT`)
- Export CSV histórico (fase 2, via reports)

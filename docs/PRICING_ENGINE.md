# Pricing Engine

Motor de precificação por cliente/tenant. Aplicado automaticamente na conclusão da corrida (`runPostTripAutomation`).

## Tipos de cálculo

| Tipo | Uso |
|------|-----|
| `fixed_price` | Valor fechado (ex.: aeroporto → hotel) |
| `km_with_minimum` | R$/km com piso de km (ex.: Comexport 20 km) |
| `daily_rate` | Diária (`fixed_price` = valor da diária) |
| `hourly_plus_extra` | Base + horas/km excedentes |
| `event_package` | Pacote fechado |
| `custom` | `settings.amount_client` |

## API

- `GET /api/pricing/rules?client_id=`
- `POST /api/pricing/rules`
- `PATCH /api/pricing/rules/[id]`
- `DELETE /api/pricing/rules/[id]` (desactiva)

RBAC: `finance.read` / `finance.write`.

## Campos na viagem (pós-cálculo)

- `km_billable`, `pricing_rule_id`, `calculation_metadata`
- `trip_financials` actualizado; títulos AR/pagável via fluxo existente
- `calculation_metadata` inclui `feature_flags_snapshot` e `pricing_profile` (`src/lib/pricing/pricing-audit-meta.ts`) para auditoria sem activar flags

## Motorista — navegação (MVP)

Botão **Abrir navegação** → Google Maps, Waze, Apple Maps. Android Auto / CarPlay = Fase 3.

## Futuro

- Feature flags: `src/lib/pricing/feature-flags.ts` (`hourly_rate`, `airport_transfer`, `fixed_plus_km`, `waiting_time`, `tolls_auto`, `parking_auto` — **off por defeito**)
- Múltiplas regras por rota/serviço (`settings` / prioridade)
- Pedágio/estacionamento conforme `toll_policy` / `parking_policy`
- UI completa para todos os tipos de cálculo

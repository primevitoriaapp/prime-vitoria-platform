## Resumo

Preparação do **night cycle** sobre o motor de precificação MVP: hardening (RLS audit, capabilities, índices 0042), feature flags de precificação extendida (**OFF por defeito**), UX motorista (timeline, skeletons), wireframe portal cliente, melhorias de mensagens API e documentação.

**Sem merge.** **Sem `db:push` 0042.** **Sem produção.**

---

## Commits deste ciclo

| Hash | Mensagem |
|------|----------|
| `9459aaf` | feat(security): capabilities RBAC e auditoria RLS (prep) |
| `b14105f` | feat(pricing): feature flags para tipos extendidos (off por defeito) |
| `a828400` | feat(driver): timeline operacional, skeletons e alvos de toque maiores |
| `7cb7de1` | docs(client): wireframe portal corporativo e checklist go-live |
| `3173507` | chore(infra): mensagens API mais claras e verificação migration 0041 no CI |
| `a799873` | docs: actualizar roadmap, security model, FSM e resumo de implementação |

**HEAD:** `a799873` · **Base:** `cursor/pricing-engine-mvp-cycle` @ `920f3f7`

---

## Impacto MVP

| Área | Impacto |
|------|---------|
| Runtime pricing Comexport | **Inalterado** — `km_with_minimum` MVP; flags extendidos desligados |
| APIs existentes | Compatíveis; erros mais claros (`mapApiError`) |
| UI motorista | Melhorias visuais (timeline, loading); sem mudança FSM backend |
| DB remoto | Apenas **0041** já aplicada; **0042 não aplicada** |

Classificação: **preparação futura** + **melhoria operacional** — MVP crítico estável.

---

## Risco de regressão

| Nível | Cenário |
|-------|---------|
| **Baixo** | Merge código sem `db:push` 0042; flags OFF |
| **Médio** | Aplicar `0042` sem janela de monitorização |
| **Alto** | RLS em `trip_financials` improvisado (reservado **0043**) |

---

## Migrations pendentes

| Migration | Conteúdo | Estado |
|-----------|----------|--------|
| **0041** | `pricing_rules`, colunas pricing em trips/financials | ✅ Aplicada (staging) |
| **0042** | Índices performance (`tenant_id`, `status`, `scheduled_at`, motorista activo) | ⏳ Local only — **não fazer push sem aprovação** |
| **0043** (futura) | RLS `trip_financials` | 📋 Documentado em `docs/RLS_AUDIT_NIGHT_CYCLE.md` |

---

## Feature flags (default OFF)

Ficheiro: `src/lib/pricing/feature-flags.ts`

| Flag | Default | Activar |
|------|---------|---------|
| `hourly_rate` | OFF | `PRICING_FEATURE_HOURLY_RATE=true` ou `settings.features` |
| `airport_transfer` | OFF | idem |
| `event_package` | OFF | idem |
| `fixed_plus_km` | OFF | idem |
| `waiting_time` | OFF | idem |
| `night_fee` | OFF | idem |
| `tolls_auto` | OFF | idem (lógica auto = fase seguinte) |
| `parking_auto` | OFF | idem |

---

## Ficheiros principais

- `src/lib/security/capabilities.ts`, `tests/tenant-isolation.test.ts`
- `src/lib/pricing/feature-flags.ts`, `src/lib/pricing/calculate.ts`
- `src/components/driver-operational-timeline.tsx`, `driver-trip-skeleton.tsx`, `driver-trips-panel.tsx`
- `docs/RLS_AUDIT_NIGHT_CYCLE.md`, `docs/CLIENT_PORTAL_WIREFRAME.md`, `docs/MVP_GO_LIVE_CHECKLIST.md`
- `supabase/migrations/0042_hardening_perf_indexes.sql`

---

## Validação obrigatória (pré-merge)

- [ ] `npm test` PASS
- [ ] Smoke preview PASS (pricing Comexport, 5 papéis, tenant isolation, API pricing)
- [ ] UI motorista sem regressão
- [ ] Sem API 500 / console crítico no smoke

**Após aprovação:** merge → `db:push` 0042 → preview final → promote produção (ciclo separado).

---

## Test plan

1. Preview deployment desta branch
2. `npm run test:e2e-smoke` (health + rotas públicas)
3. `npm run test:e2e-staging-all` (5 papéis)
4. `npm run test:e2e-pricing-preview` (Comexport 12 km → 20 km billable)
5. Revisão visual painel motorista (timeline, navegação)

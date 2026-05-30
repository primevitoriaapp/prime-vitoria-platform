# Quick start — Sessão de smoke (1 página)

> Para quem **usa** o sistema como operação Prime Vitória.  
> Registo obrigatório no fim: [STAGING_VALIDATION_EXECUTION_LOG.md](./STAGING_VALIDATION_EXECUTION_LOG.md)

**Tempo total:** ~40–65 min (operacional + FCM)

---

## Antes de abrir o browser

```bash
export BASE_URL="https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app"
export STAGING_E2E_PASSWORD="<senha seed>"
npm run staging:validation-preflight
npm run staging:smoke-urls
# opcional: npm run staging:validation-automated
```

Firebase no Vercel: [FIREBASE_FCM_SETUP.md](./FIREBASE_FCM_SETUP.md)

Opcional no Preview: `NEXT_PUBLIC_STAGING_SMOKE_HINTS=true` — atalho para corrida oficial na UI.

---

## Contas staging (mesma password)

| Papel | Email | Entrada |
|-------|-------|---------|
| Operador | `staging-operador@example.com` | `/login?next=/agenda` |
| Financeiro | `staging-financeiro@example.com` | `/login?next=/finance` |
| Motorista | `staging-motorista@example.com` | `/login?next=/driver` |
| Cliente | `staging-cliente@example.com` | `/login?next=/client` |
| Admin | `staging-admin@example.com` | `/login?next=/dashboard` |

---

## Corrida de referência (seed)

| ID | Estado inicial | Uso no smoke |
|----|----------------|--------------|
| `c2000000-0000-4000-8000-000000000001` | **requested** | Ciclo completo operador → motorista → cliente |
| `c2000000-0000-4000-8000-000000000002` | **dispatched** | Teste rápido motorista (já despachada) |

Prefixo na UI: `c2000000…`

---

## Roteiro mínimo (uma corrida)

### A. Operador (~10 min)

1. `/agenda` → **Abrir** na viagem `…000001`
2. **Assumir** (se barra no topo)
3. **Aprovar** → **Despachar** (motorista staging)
4. Timeline mostra `dispatched`?

**FAIL se:** consola UUID em `/dispatch` foi necessária.

### B. Motorista (~10 min)

1. `/driver` — banner push (activar se possível)
2. **Aceitar corrida** → estados até **Finalizada**
3. Confirmar diálogo final

**FAIL se:** não apareceu corrida e só UUID/API resolveu.

### C. Cliente (~5 min)

1. `/client` — modo consulta
2. **Ver detalhe** — timeline = estado do motorista
3. Centros de custo / passageiros legíveis

### D. FCM (~15 min, se secrets)

[FCM_OPERATIONAL_SMOKE.md](./FCM_OPERATIONAL_SMOKE.md) F1–F9

### E. Pricing

Na corrida de teste (ou script automatizado): **12 km → 20 km** Comexport.

---

## Workaround = FAIL global

- Consola UUID `/dispatch`
- `curl` manual para mudar estado
- Portal write activado só para criar viagem

---

## No fim (2 min)

1. Copiar bloco em [STAGING_VALIDATION_EXECUTION_LOG.md](./STAGING_VALIDATION_EXECUTION_LOG.md)
2. Marcar G1–G5 e F1–F9
3. Listar atritos **P0/P1** (engenharia corrige só estes)

---

## Modo do projecto

**Acabamento operacional** — [MODO_VALIDACAO_OPERACIONAL_HUMANA.md](./MODO_VALIDACAO_OPERACIONAL_HUMANA.md)

Nenhuma feature nova relevante sem este ciclo **PASS** primeiro.

# Roteiro oficial — Smoke humano operacional (MVP)

> Valida o ciclo completo Prime Vitória em **staging/preview**, sem produção.  
> Portal cliente permanece **read-only** por defeito neste roteiro.

**Tempo estimado de execução real:** 25–40 minutos (1 tester, 3 logins) · 45–60 min se incluir oferta de parceiros e KM manual.

**Pré-requisitos**

| Item | Detalhe |
|------|---------|
| Ambiente | URL preview Vercel ou staging com Supabase real |
| Seed | `npm run seed:staging` com `STAGING_SEED_ENABLED=true` |
| Contas | Ver [STAGING_E2E.md](./STAGING_E2E.md) — `staging-operador@`, `staging-motorista@`, `staging-cliente@` |
| Password | `STAGING_SEED_PASSWORD` (mín. 12 caracteres) |
| Browser | Chrome mobile + desktop (motorista em viewport ~390px) |
| Opcional | Viagem seed `requested`: id `c2000000-0000-4000-8000-000000000001` |

**Critério de sucesso do ciclo:** os 3 papéis fecham uma corrida de `requested` (ou seed) até `completed` **sem workaround crítico** (UUID console, API manual, ou estado errado na agenda).

---

## Checklist global PASS/FAIL

| # | Critério | PASS | FAIL |
|---|----------|------|------|
| G1 | Operador aprova e despacha sem erro de reivindicação | ☐ | ☐ |
| G2 | Motorista aceita e avança todos os estados até finalizada | ☐ | ☐ |
| G3 | Cliente vê estado coerente no portal (lista + detalhe) | ☐ | ☐ |
| G4 | Timeline operador regista transições | ☐ | ☐ |
| G5 | Nenhum passo obrigatório exige colar UUID na consola | ☐ | ☐ |

**Resultado global:** ☐ PASS · ☐ FAIL

---

## 1. Fluxo operador

**Login:** `staging-operador@example.com` → `/login` → `/agenda`

### Passos (despacho direcionado — caminho mínimo)

| Passo | Acção | Cliques acum. | PASS/FAIL | Notas |
|-------|--------|---------------|-----------|-------|
| O1 | Abrir `/agenda` — confirmar tabela com viagens no intervalo | 0 | ☐ | Se vazio: alargar datas no formulário |
| O2 | Na viagem `requested` (seed ou nova), clicar **Abrir** | 1 | ☐ | Antes: link dizia "Notas" (corrigido) |
| O3 | No painel: **Assumir atendimento** (se barra de reivindicação visível) | 2 | ☐ | Barra deve estar **no topo** do painel |
| O4 | **Aprovar corrida** | 3 | ☐ | |
| O5 | Seleccionar motorista + **Despachar corrida** | 4–5 | ☐ | Mensagem de erro clara se faltar claim |
| O6 | Abrir timeline — ver transição `approved` → `dispatched` | 5 | ☐ | |
| O7 | (Opcional) Fila em `/dispatch` → **Abrir na agenda** com datas correctas | +1 | ☐ | |

**Cliques alvo (happy path):** 5–6 + scroll.

### Alternativa: fila operacional

1. `/dispatch` → secção fila → **Abrir na agenda**  
2. Continuar O3–O6 no painel da agenda.

### Blockers conhecidos (operador)

| ID | Blocker | Mitigação |
|----|---------|-----------|
| OB1 | `require_operational_claim` sem assumir | Assumir antes de despachar |
| OB2 | Viagem fora do filtro de datas | Usar **Abrir** (com intervalo automático) ou aviso amarelo na agenda |
| OB3 | Consola UUID em `/dispatch` | Usar agenda; consola está em *Ferramentas avançadas* |

### Atritos a observar (registar)

- Mensagens de erro compreensíveis?
- Número de cliques até despacho?
- Confusão entre oferta vs despacho direto?

---

## 2. Fluxo motorista

**Login:** `staging-motorista@example.com` → `/driver` (PWA: adicionar ao ecrã inicial)

| Passo | Acção | Cliques | PASS/FAIL | Notas |
|-------|--------|---------|-----------|-------|
| M1 | Confirmar secção **Corridas activas** (ou mensagem + Actualizar) | 0 | ☐ | |
| M2 | **Online** (se painel de disponibilidade existir) | 1 | ☐ | |
| M3 | **Aceitar corrida** (estado `dispatched`) | 2 | ☐ | Botão com texto humano, não "Próximo:" |
| M4 | **A caminho** → **Chegou ao local** → **Em andamento** | 3–5 | ☐ | Um botão principal por vez |
| M5 | **Finalizada** — confirmar diálogo | 6 | ☐ | |
| M6 | **Navegar — Waze** (ou Maps) abre app/rota | opcional | ☐ | |
| M7 | **Enviar GPS** (opcional, trail KM) | opcional | ☐ | |

**Cliques alvo (estados):** 6–7.

### Blockers conhecidos (motorista)

| ID | Blocker | Mitigação |
|----|---------|-----------|
| MB1 | Corrida não aparece após despacho | **Actualizar** ou aguardar 20s / Realtime |
| MB2 | FCM não configurado | Esperado — usar Actualizar; ver [FCM_PWA_READINESS.md](./FCM_PWA_READINESS.md) |
| MB3 | Oferta em vez de despacho directo | Aceitar oferta → operador **Confirmar parceiro** |

---

## 3. Fluxo cliente (read-only)

**Login:** `staging-cliente@example.com` → `/client`

| Passo | Acção | Cliques | PASS/FAIL | Notas |
|-------|--------|---------|-----------|-------|
| C1 | Ver banner **Modo consulta activo** | 0 | ☐ | |
| C2 | Dashboard: KPIs (mês, em andamento, aguarda aprovação) | 0 | ☐ | |
| C3 | Lista **Minhas corridas** — estado legível | 0 | ☐ | |
| C4 | **Ver detalhe** na corrida do smoke | 1 | ☐ | |
| C5 | Detalhe: **Estado actual da corrida** + timeline | 1 | ☐ | Skeleton ao carregar |
| C6 | Secção rastreio (texto informativo, sem POST) | 1 | ☐ | |
| C7 | Centros de custo + passageiros (scroll) | 0 | ☐ | |

**Nota:** criar corrida pelo portal **não** faz parte deste roteiro (read-only). A corrida vem do operador/seed.

### Blockers conhecidos (cliente)

| ID | Blocker | Mitigação |
|----|---------|-----------|
| CB1 | Lista vazia com erro de sessão | Mensagem vermelha + **Tentar novamente** |
| CB2 | Esperar botão "Solicitar" | Modo consulta — operação interna cria viagens |

---

## 4. Registo de atritos e prioridades

Preencher após o smoke. Lista canónica em [OPERATIONAL_FRICTION_LOG.md](./OPERATIONAL_FRICTION_LOG.md).

| Prioridade | Atrito | Papel | Estado |
|------------|--------|-------|--------|
| P0 | — | — | Corrigido no ciclo / Aberto / Adiado |

**Legenda prioridade:** P0 = bloqueia operação · P1 = atrito forte · P2 = polish · P3 = futuro

---

## 5. Workarounds manuais (evitar no smoke PASS)

| Workaround | Quando usar | Impacto no PASS |
|------------|-------------|-----------------|
| `DispatchConsole` (UUID) | Debug API | **FAIL** G5 |
| Endpoints listados em `/dispatch` | Integração | **FAIL** G5 |
| `NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY=false` | Testar writes cliente | Fora deste roteiro |
| KM manual no painel agenda | GPS insuficiente | OK (operador) |
| Libertar claim stale via admin | Conflito multiatendimento | Anotar blocker |

---

## 6. Pós-smoke técnico (opcional)

```bash
# Local (com .env.supabase.local)
npm test
npm run build
PLAYWRIGHT_STAGING=1 npm run test:e2e-playwright:staging  # credenciais reais

# Preview (com bypass)
export BASE_URL=https://<preview>.vercel.app
export VERCEL_AUTOMATION_BYPASS_SECRET='...'
export STAGING_E2E_PASSWORD='...'
npm run test:night-preview-smoke
```

---

## 7. Histórico de execuções

| Data | Ambiente | Tester | Global | Notas |
|------|----------|--------|--------|-------|
| | | | | |

---

Ver também: [MVP_OPERATIONAL_MODE.md](./MVP_OPERATIONAL_MODE.md) · [BLOCKERS_AND_NEXT_ACTIONS.md](./BLOCKERS_AND_NEXT_ACTIONS.md)

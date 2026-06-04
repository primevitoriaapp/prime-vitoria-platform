# Checklist homologação P1 — operacional

> **URL:** [P1_HOMOLOGACAO_URL_OFICIAL.md](./P1_HOMOLOGACAO_URL_OFICIAL.md)  
> **Login:** `staging-operador@example.com` + senha do seed  
> **P2 bloqueado** até PASS integral abaixo.

---

## Pré-requisitos (antes dos 4 testes)

| # | Item | PASS | FAIL |
|---|------|------|------|
| P0 | Preview abre (não 401 Vercel) | | |
| P0 | URL é preview P1 (não `prime-vitoria-web.vercel.app`) | | |
| P0 | Menu: Clientes, Motoristas, Veículos, Despacho | | |
| P0 | Migration 0044 PASS (`npm run db:validate-operational-0044` ou workflow verde) | | |
| P0 | Login operador funciona | | |

---

## Testes obrigatórios (critério de aprovação)

### 1. Criar cliente Segpro

| Passo | Detalhe |
|-------|---------|
| Rota | `/clients` |
| Tipo | PJ |
| CNPJ | Consultar (Brasil API) ou preencher manual |
| Nome | Razão social **Segpro** (ou nome real) |
| Gravar | Registar cliente |

| PASS | FAIL |
|------|------|
| Cliente aparece na lista; sem erro de coluna/SQL | Erro ao gravar; enum PF/PJ; página antiga |

**Evidência:** print lista com Segpro.

---

### 2. Cadastrar Felipe motorista

| Passo | Detalhe |
|-------|---------|
| Rota | `/drivers` |
| Dados | Nome **Felipe**, telefone, WhatsApp, cidade, categoria, Pix/banco (opcional) |
| Gravar | Guardar ficha |

| PASS | FAIL |
|------|------|
| Felipe na lista; ficha reabre com dados | Erro 500; campos não persistem |

**Evidência:** print ficha Felipe.

---

### 3. Vincular BYD King ao Felipe

| Passo | Detalhe |
|-------|---------|
| Rota | `/drivers` → editar Felipe |
| Veículo | Placa/modelo **BYD King** (ou placa real); criar e vincular |
| Padrão | Marcar veículo como padrão se disponível |

| PASS | FAIL |
|------|------|
| BYD King na secção veículos; aparece em `/vehicles` | Vínculo não grava |

**Evidência:** print veículos vinculados + `/vehicles`.

---

### 4. Criar / despachar corrida

| Passo | Detalhe |
|-------|---------|
| Rota | `/agenda` |
| Corrida | Usar seed `…000001` (requested) ou criar nova |
| Despacho | Motorista **Felipe** → veículo **BYD King** → despachar |

| PASS | FAIL |
|------|------|
| Corrida muda para despachada; veículo correcto | Motorista sem veículo; erro API |

**Evidência:** print painel despacho ou corrida despachada.

---

## Resumo final

| Teste | PASS / FAIL | Notas |
|-------|-------------|-------|
| 1 Segpro | | |
| 2 Felipe | | |
| 3 BYD King | | |
| 4 Despacho | | |

**P1 aprovado:** os 4 testes = PASS e pré-requisitos P0 = PASS.  
**Enviar:** 4 prints ou 1 vídeo ≤2 min + este checklist preenchido.

---

## Screenshots automáticos (engenharia)

Após preview + secrets configurados:

```bash
PLAYWRIGHT_STAGING=1 \
PLAYWRIGHT_BASE_URL="https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app" \
STAGING_E2E_PASSWORD="..." \
NEXT_PUBLIC_SUPABASE_URL="..." \
NEXT_PUBLIC_SUPABASE_ANON_KEY="..." \
VERCEL_AUTOMATION_BYPASS_SECRET="..." \
npx playwright test e2e/p1-operational-cadastro-staging.spec.ts
```

Saída: `artifacts/p1-staging/*.png`

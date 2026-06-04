# Diagnóstico definitivo de ambientes — P1

> Atualizado para homologação P1. **Não confundir produção com preview.**

---

## Mapa de ambientes

| Ambiente | Branch Git | Commit (HEAD conhecido) | URL | UI P1? |
|----------|------------|-------------------------|-----|--------|
| **Homologação P1** | `cursor/pricing-engine-mvp-cycle` | `3cd8522` | [URL oficial](./P1_HOMOLOGACAO_URL_OFICIAL.md) | **Sim** |
| **Produção** | `main` | `8412504` | https://prime-vitoria-web.vercel.app | **Não** |
| PR #2 | `cursor/pricing-engine-mvp-cycle` | último push | Preview Vercel do PR | Sim (se deploy OK) |

**Diferença:** ~44 commits entre `main` e a branch P1. Produção **não** recebe P1 até merge explícito (fora de scope).

---

## Projeto Vercel

| Campo | Valor |
|-------|--------|
| Team | `rubens-projects2` |
| Project | `prime-vitoria-web` |
| Production branch | `main` |
| Preview | branches ≠ `main` (inclui `cursor/pricing-engine-mvp-cycle`) |

---

## Supabase (staging / preview)

O preview Vercel usa as variáveis **Preview** ligadas a um projeto Supabase.  
Documentação histórica do project ref linked: `tcpgmndarqxwfnonzurl` (confirmar no painel Supabase).

**Importante:** Preview e Production **podem** partilhar o mesmo Supabase — nesse caso seed e migration 0044 afectam os mesmos dados. Não usar `db:push` destrutivo.

---

## Commits relevantes P1 (ordem)

| Commit | Descrição |
|--------|-----------|
| `9bc65ed` | feat(p1): cadastro operacional (cliente, motorista, veículos, despacho) |
| `fe28ce0` | workflows CI + validação 0044 |
| `14e983f` | docs staging P1 |
| `3cd8522` | fix staging: nav por papel + login financeiro |

---

## Comandos de diagnóstico (local)

```bash
# Cartão completo + blockers
npm run p1:homologation:handoff

# Só preview 401 ou 200
npm run p1:check-preview

# Pacote noite (vários checks)
npm run p1:night-unblock

# Diagnóstico 12 pontos (requer secrets no shell)
npm run staging:diagnostic
```

---

## API / página de status (sem secrets)

Após preview acessível:

```
GET https://<preview>/api/staging-status
GET https://<preview>/staging-status
```

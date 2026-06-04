# URL oficial para homologação P1

> **Abra só este link para homologar P1.**  
> O domínio principal é produção (`main`) — interface antiga, sem cadastro P1.

---

## Uma URL — homologação P1

| | |
|---|---|
| **URL** | https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app |
| **Branch** | `cursor/pricing-engine-mvp-cycle` |
| **Commit P1** | `3cd8522` |
| **Deployment Vercel** | https://vercel.com/rubens-projects2/prime-vitoria-web/b4zBDpLScquyL6hLqyAs4NxDL3cP |

**Página de status (após preview acessível):**  
`/staging-status` na URL acima.

---

## NÃO usar para P1

| URL | Motivo |
|-----|--------|
| https://prime-vitoria-web.vercel.app | Produção — `main` @ `8412504` — menu antigo, erro PF/PJ |

---

## Como saber que está no ambiente certo

| Sinal | P1 (certo) | Produção (errado) |
|-------|------------|-------------------|
| Host | `...git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app` | `prime-vitoria-web.vercel.app` |
| Menu logado (operador) | Clientes, Motoristas, Veículos, Despacho | Só Painel, Agenda, Utilizadores… |
| `/clients` | Select PF/PJ | Enum “Tipo (PF/PJ)” com erro |
| `/staging-status` | `is_p1_environment: true` | `false` ou inacessível |

---

## Documentos relacionados

| Tópico | Ficheiro |
|--------|----------|
| Amanhã — passos em ordem | [AMANHA_P1.md](./AMANHA_P1.md) |
| Ambientes completos | [P1_AMBIENTES_DIAGNOSTICO.md](./P1_AMBIENTES_DIAGNOSTICO.md) |
| Desbloquear preview 401 | [P1_VERCEL_PREVIEW_ACESSO.md](./P1_VERCEL_PREVIEW_ACESSO.md) |
| Secrets | [P1_SECRETS_CHECKLIST.md](./P1_SECRETS_CHECKLIST.md) |
| Migration 0044 | [P1_MIGRATION_0044_STAGING.md](./P1_MIGRATION_0044_STAGING.md) |
| Logins seed | [P1_SEED_LOGINS.md](./P1_SEED_LOGINS.md) |
| Checklist operacional | [P1_CHECKLIST_HOMOLOGACAO.md](./P1_CHECKLIST_HOMOLOGACAO.md) |

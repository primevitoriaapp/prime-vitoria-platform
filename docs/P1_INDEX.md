# Índice P1 — homologação operacional

> **Comece aqui amanhã:** [AMANHA_P1.md](./AMANHA_P1.md)  
> **Relatório desta noite:** [RELATORIO_NOITE_P1.md](./RELATORIO_NOITE_P1.md)

---

## URL única

**[P1_HOMOLOGACAO_URL_OFICIAL.md](./P1_HOMOLOGACAO_URL_OFICIAL.md)**

Na app (preview): `/p1-homologacao` · `/staging-status`

---

## Por tarefa

| Preciso de… | Documento |
|-------------|-----------|
| Saber qual URL abrir | [P1_HOMOLOGACAO_URL_OFICIAL.md](./P1_HOMOLOGACAO_URL_OFICIAL.md) |
| Mapa produção vs preview | [P1_AMBIENTES_DIAGNOSTICO.md](./P1_AMBIENTES_DIAGNOSTICO.md) |
| Desbloquear 401 no preview | [P1_VERCEL_PREVIEW_ACESSO.md](./P1_VERCEL_PREVIEW_ACESSO.md) |
| Configurar secrets | [P1_SECRETS_CHECKLIST.md](./P1_SECRETS_CHECKLIST.md) |
| Aplicar migration 0044 | [P1_MIGRATION_0044_STAGING.md](./P1_MIGRATION_0044_STAGING.md) |
| Logins e senha seed | [P1_SEED_LOGINS.md](./P1_SEED_LOGINS.md) |
| Testar Segpro / Felipe / BYD / despacho | [P1_CHECKLIST_HOMOLOGACAO.md](./P1_CHECKLIST_HOMOLOGACAO.md) |
| Preview antigo (contexto) | [STAGING_PREVIEW_OFFICIAL.md](./STAGING_PREVIEW_OFFICIAL.md) |

---

## Comandos npm

| Comando | Função |
|---------|--------|
| `npm run p1:check-preview` | HTTP 200 vs 401 no preview |
| `npm run p1:compare-environments` | Produção (antiga) vs preview P1 |
| `npm run p1:amanha` | Imprime guia AMANHA_P1 no terminal |
| `npm run p1:night-unblock` | Diagnóstico agregado |
| `npm run p1:homologation:handoff` | URL + logins + blockers |
| `npm run db:apply-0044-staging` | Apply 0044 (staging, com confirmação) |
| `npm run db:validate-operational-0044` | Validar 0044 read-only |

---

## Workflows GitHub (Actions)

| Workflow | Quando |
|----------|--------|
| Staging migration 0044 (P1 cadastro) | Antes de gravar clientes/motoristas |
| Staging seed (remote) | Antes de login staging |
| Staging P1 validation | Opcional — migration + Playwright |

---

## Bloqueios conhecidos

- Preview **401** → Vercel Authentication  
- Domínio principal → **produção**, não P1  
- 0044 não aplicada → gravação falha  
- Seed não corrido → login inválido  

**P2 bloqueado** até PASS integral do checklist homologação.

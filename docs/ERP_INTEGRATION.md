# Integracao ERP - Conta Azul e Omie

## Visao geral

O sistema registra titulos internos em `accounts_receivable` e sincroniza com o ERP via:

- `POST /api/integrations/:provider/sync/receivable` (sincrono)
- `GET /api/integrations/jobs` (fila por tenant, paginacao; mesma capability que enqueue)
- `POST /api/integrations/jobs` + `POST /api/jobs/erp/process` (fila)
- `POST /api/integrations/mappings` (cadastro interno -> ID no ERP)

Variavel `mode` na resposta do sync: `live` quando credenciais de API estao definidas (token CA ou app_key/secret Omie), senao `mock` (IDs simulados).

### Mapeamento de cliente (recomendado)

Antes de sincronizar recebiveis, cadastre o cliente interno (`clients.id`) no ERP:

| Campo API | `provider` | `entity_type` | `internal_id` | `external_id` |
|-----------|------------|---------------|----------------|---------------|
| Cliente Omie | `omie` | `client` | UUID do cliente interno | Codigo numerico Omie (string) |
| Cliente Conta Azul | `conta_azul` | `client` | UUID do cliente interno | UUID do cliente no Conta Azul |
| Item linha venda (opcional) | `conta_azul` | `conta_azul_item` | UUID do cliente interno | UUID do item/servico no CA |

Exemplo `POST /api/integrations/mappings`:

```json
{
  "provider": "omie",
  "entity_type": "client",
  "internal_id": "uuid-do-cliente-no-sistema",
  "external_id": "4214850"
}
```

### Autenticacao (producao)

1. **JWT Supabase** (preferencial): enviar `Authorization: Bearer <access_token>`. O servidor valida o token com `NEXT_PUBLIC_SUPABASE_ANON_KEY`, carrega `profiles.role` pelo `user.id` e, para `motorista`, tenta resolver `drivers.id` pelo `profile_id`.
2. **Fallback dev**: cabecalhos `x-role`, `x-user-id`, `x-client-id`, `x-driver-id` quando nao houver JWT ou variaveis Supabase incompletas.

### Protecao de rede

- `ERP_INTEGRATION_ALLOWED_IPS`: lista separada por virgula. Se definida, apenas esses IPs podem acessar `/api/integrations/*` e `POST /api/jobs/erp/process`, `POST /api/jobs/notifications/process`, `POST /api/jobs/reconcile/run` (usa `x-forwarded-for` ou `x-real-ip`).
- Rate limit: 120 req/min por IP e por rota (integracoes e esses endpoints de jobs).

**Permissoes**

| Metodo | Rota | Roles |
|--------|------|--------|
| GET | `/api/integrations/reconciliation-issues` | admin, operador, financeiro (`erp.mapping.read`) — divergencias ERP do tenant |
| PATCH | `/api/integrations/reconciliation-issues/:id` | `finance.write` ou `erp.mapping.write` — `{ "status": "resolved" }` |
| GET | `/api/finance/receivables` | financeiro (`finance.read`) — titulos do tenant via viagem |
| GET | `/api/finance/trips/:id` | admin, financeiro (`finance.read`) — resumo financeiro da corrida + mapeamentos ERP do titulo |
| GET | `/api/integrations/mappings` | admin, operador, financeiro |
| POST | `/api/integrations/mappings` | admin, operador |
| GET | `/api/integrations/jobs` | admin, operador, financeiro (`erp.jobs.enqueue`) — lista `erp_sync_jobs` do `tenant_id` da sessao |
| POST | `/api/integrations/jobs` | admin, operador, financeiro (`erp.jobs.enqueue`) — grava `tenant_id`; titulo deve ser da mesma org; duplicado `queued` devolve `deduplicated: true` |
| POST | `/api/integrations/:provider/sync/receivable` | admin, operador (`erp.mapping.write`) |
| POST | `/api/jobs/erp/process` | admin, operador (`erp.jobs.process`) ou Bearer `ERP_JOB_PROCESS_SECRET` |
| POST | `/api/jobs/notifications/process` | admin, operador (`jobs.notifications.process`) ou Bearer `NOTIFICATION_JOB_PROCESS_SECRET` |
| POST | `/api/jobs/reconcile/run` | admin, operador, financeiro (`jobs.reconcile.run`) ou Bearer `RECONCILE_JOB_PROCESS_SECRET`. Sessao: so mapeamentos do `tenant_id` do perfil. Maquina: opcional `?tenant_id=<uuid>` para uma org; sem parametro percorre todos (limite 500) |

Listagem com filtros: `GET /api/integrations/mappings?provider=omie&entity_type=client&page=1&pageSize=50`

### Reconciliacao (`/api/jobs/reconcile/run`)

Resposta inclui `issues` (novos registos `erp_reconciliation_issues` nesta execucao) e `scanned` (mapeamentos `receivable` analisados). Issues `missing_external` em aberto sao deduplicados por tenant/provedor/titulo (indice unico parcial, migracao `0020`).

O sync de recebivel chama `enrichReceivableFromErpMappings` e preenche `omieCodigoClienteFornecedor` / `contaAzulIdCliente` / `contaAzulIdItemServico` no DTO antes do HTTP.

### RLS no Supabase

A migracao `0003_erp_entity_mappings_rls.sql` restringe a tabela `erp_entity_mappings` para usuarios autenticados via Supabase (JWT). As rotas Next que usam **service role** nao sao limitadas por essas policies; a autorizacao nelas e feita pelo RBAC em codigo (`assertCapability`).

## Omie (conta a receber)

Implementacao: JSON-RPC `IncluirContaReceber` em `src/lib/integrations/omie-http.ts`.

Variaveis para modo **live** (HTTP real):

| Variavel | Descricao |
|----------|-----------|
| `ERP_OMIE_APP_KEY` | App Key Omie |
| `ERP_OMIE_APP_SECRET` | App Secret Omie |
| `ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR` | Codigo global do cliente (opcional se usar mapeamento `client` por `internal_id`) |

Opcionais: `ERP_OMIE_CODIGO_CATEGORIA`, `ERP_OMIE_ID_CONTA_CORRENTE`, `ERP_OMIE_API_URL`.

Idempotencia de integracao: `codigo_lancamento_integracao` = `PV-{uuid_interno}` (ate 60 caracteres).

## Conta Azul (venda)

A API publica de vendas usa `POST https://api-v2.contaazul.com/v1/venda` (ver documentacao oficial).

Implementacao: `src/lib/integrations/conta-azul-http.ts`.

Variaveis para modo **live**:

| Variavel | Descricao |
|----------|-----------|
| `ERP_CONTA_AZUL_ACCESS_TOKEN` | Bearer JWT (obrigatorio) |
| `ERP_CONTA_AZUL_ID_CLIENTE` | UUID do cliente no CA (opcional se mapeamento `client`) |
| `ERP_CONTA_AZUL_ID_ITEM_SERVICO` | UUID do item da venda (opcional se mapeamento `conta_azul_item`) |

Se `ERP_CONTA_AZUL_NUMERO_VENDA` estiver vazio, o sistema chama `GET /v1/venda/proximo-numero` antes de criar a venda.

## Tratamento de erros

Falhas HTTP ou fault SOAP Omie retornam `502` no endpoint de sync e gravam mensagem em `erp_sync_jobs.last_error` quando processados pela fila.

## Testes

```bash
npm test
```

Inclui testes de dominio (status, margem, conflito) e formato de data Omie.

# RBAC Matrix

## Modelo

- **Papel (`user_role`):** admin, operador, financeiro, cliente, motorista.
- **Capability:** string estável usada em código (`trip.read`, `finance.write`, …).
- **Implementação:** `src/lib/security/rbac.ts` + `assertCapability` nas rotas.
- **Evolução:** compatibilidade com JWT custom claims (`capabilities[]`) — **fase posterior**; hoje o papel deriva capabilities no servidor.

## Capabilities atuais (código)

| Capability | Descrição resumida |
|------------|-------------------|
| `*` | Admin — tudo |
| `trip.read` | Visão global de viagens |
| `trip.read.own` | Viagens do cliente |
| `trip.read.assigned` | Viagens atribuídas ao motorista |
| `trip.write` | Criar/editar viagens (operacional) |
| `trip.request` | Cliente solicitar viagem |
| `trip.accept` | Motorista aceitar |
| `trip.status` | Motorista atualizar status |
| `dispatch` | Despacho / fila operacional |
| `driver.read` | Listar motoristas |
| `vehicle.read` / `vehicle.write` | Frota |
| `client.read` / `client.write` | Clientes corporativos |
| `location.write` | Posição GPS |
| `finance.read` / `finance.write` | Financeiro |
| `finance.payable.read.own` | Pagáveis do motorista |
| `finance.payable.proof.own` | Comprovantes motorista |
| `report.read` | Relatórios operacionais/financeiros |
| `erp.mapping.read` / `erp.mapping.write` | Mapeamentos ERP |
| `erp.jobs.enqueue` / `erp.jobs.process` | Fila ERP |
| `jobs.notifications.process` | Fila de notificações |
| `jobs.reconcile.run` | Reconciliação |
| `profiles.read` | Perfis da organização |
| `notifications.read` | In-app notifications |

## Matriz papel × capability (estado atual)

| Capability | admin | operador | financeiro | motorista | cliente |
|------------|:-----:|:--------:|:----------:|:---------:|:-------:|
| `*` | ✓ | | | | |
| `trip.read` | ✓ | ✓ | ✓ | | |
| `trip.read.assigned` | | | | ✓ | |
| `trip.read.own` | | | | | ✓ |
| `trip.write` | ✓ | ✓ | | | |
| `trip.request` | | | | | ✓ |
| `trip.accept` / `trip.status` | | | | ✓ | |
| `dispatch` | ✓ | ✓ | | | |
| `driver.read` | ✓ | ✓ | | | |
| `vehicle.*` | ✓ | ✓ | | | |
| `client.*` | ✓ | ✓ | | | |
| `location.write` | ✓ | ✓ | | ✓ | |
| `finance.read` / `finance.write` | ✓ | | ✓ | | |
| `finance.payable.*.own` | | | | ✓ | |
| `report.read` | ✓ | | ✓ | | |
| `erp.*` | ✓ | parcial | parcial | | |
| `jobs.notifications.process` | ✓ | ✓ | | | |
| `jobs.reconcile.run` | ✓ | ✓ | ✓ | | |
| `notifications.read` | ✓ | ✓ | ✓ | | |

## Namespace alvo (evolução — não quebrar nomes atuais)

Mapeamento conceitual para capabilities futuras (prefixo sugerido):

| Domínio | Exemplos alvo |
|---------|----------------|
| `rides.*` | `rides.create`, `rides.edit`, `rides.dispatch`, `rides.cancel` |
| `financial.*` | `financial.view`, `financial.approve` |
| `driver.*` | `driver.manage` |
| `client.*` | `client.manage` |
| `audit.*` | `audit.view` |
| `admin.*` | `admin.users` |

**Estratégia:** introduzir aliases novos mantendo capabilities legadas até migração completa das rotas.

## JWT custom claims (preparado)

Formato alvo no token (fase posterior):

```json
{
  "tenant_id": "uuid",
  "role": "operador",
  "capabilities": ["trip.read", "trip.write", "dispatch"]
}
```

Servidor: `can()` passa a unir capabilities do papel + claims, com deny-by-default.

## Testes

- `tests/erp-rbac.test.ts` — regras críticas (financeiro sem process de notificações, cliente `trip.read.own`, etc.).
- `scripts/e2e-staging-auth.mjs` — validação HTTP por papel em staging.

## Riscos mitigados

- Permissão “só no UI” → toda rota sensível chama `assertCapability`.
- Drift documentação/código → esta matriz referencia `rbac.ts` como fonte até claims JWT.

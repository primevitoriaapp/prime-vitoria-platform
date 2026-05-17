# Bootstrap Prime Vitória

Use este fluxo para configurar o primeiro tenant operacional depois de aplicar as migrations no Supabase.

## Pré-requisitos

- Supabase Auth com o usuário `contato@primevitoria.com` já criado.
- Variáveis locais com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- Alternativamente, gere `.env.supabase.local` via Supabase CLI e mantenha o arquivo fora do Git.

## Execução

```bash
npm run bootstrap:prime
```

O script é idempotente e cria/atualiza:

- tenant `Prime Vitória`
- profile admin para `contato@primevitoria.com`
- metadados Auth `role=admin`, `owner_role=ADMIN_OWNER`, `super_admin=true`
- cliente, motorista, veículo e duas corridas de teste
- configuração inicial de despacho e auditoria de bootstrap

## Pós-execução

Faça logout/login novamente com `contato@primevitoria.com` ou atualize a sessão. As telas de Painel, Agenda, Utilizadores, Auditoria, Motoristas e Clientes devem abrir com dados do tenant inicial.

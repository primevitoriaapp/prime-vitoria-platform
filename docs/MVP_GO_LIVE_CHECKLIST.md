# MVP Go-Live Checklist

Checklist operacional antes de promover **produção**. Não substitui [GO_LIVE_RUNBOOK.md](./GO_LIVE_RUNBOOK.md).

## Base de dados

- [ ] Migrations `0001`–`0042` aplicadas no Supabase alvo
- [ ] `npm run db:validate-pricing-0041` → PASS
- [ ] Backup / WALG confirmado no Dashboard

## Secrets Vercel (Production)

- [ ] Supabase (`NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] `CRON_SECRET`, job secrets (ciclo A)
- [ ] `FCM_SERVER_KEY` + Firebase Web (7 vars) — [FIREBASE_FCM_SETUP.md](./FIREBASE_FCM_SETUP.md)

## Deploy

- [ ] Preview smoke PASS (pricing + 5 papéis)
- [ ] **Aprovação explícita** para `vercel deploy --prod`
- [ ] Pós-deploy: `npm run test:e2e-staging-all` contra URL produção

## Operacional

- [ ] Seed staging validado; produção sem seed destrutivo
- [ ] Regra Comexport (ou cliente piloto) configurada
- [ ] Operador + motorista testam despacho → push → aceite (quando FCM activo)

## Documentação

- [ ] [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) actualizado
- [ ] Relatório 12 itens do ciclo arquivado

# Prime Vitoria - Implementation Summary

## Implemented phases in this delivery

1. Database structure (Supabase migration with operational, financial, notification and ERP tables)
2. Operational rules and trip status machine
3. Administrative web panel scaffolding
4. Operational agenda: listing, quick approve, multiatendimento (claim), KM panel, finance/ERP (admin/financeiro), ERP enqueue (operador), timeline + notas
5. Corporate client portal (solicitação, KPIs, rastreio, refresh em tempo real)
6. Driver API and PWA panel (fluxo estados, GPS trail, Maps/Waze, push)
7. Vehicle API and panel scaffold
8. Manual dispatch flow, reassign API and automatic offer dispatch flow
9. Scheduled trips creation and retrieval API
10. Driver PWA manifest + service worker scaffold
11. Driver location validation module
12. Operational finance generation API
13. Operations report API
14. Notification queue, enqueue module and processing endpoint (**FCM legacy real** quando `FCM_SERVER_KEY`; falhas explicitas; `POST /api/drivers/push-token`)
15. RBAC module + SQL RLS policies
16. Conta Azul adapter scaffold
17. Omie adapter scaffold
18. Performance baseline indexes + server-side listing pagination/filtering
19. Security baseline with RLS, capability assertions and rate limiting
20. Go-live artifacts baseline (env example, runbook, docs, folder architecture)

## Remaining execution notes

- Install npm/pnpm and dependencies to run app and tests.
- Apply migrations `0001`–`0038` in Supabase (`0031` realtime webhooks; `0030` processamento inbox; `0029` webhook inbox; `0028` bucket `payment-proofs`; `0027` `require_operational_claim`; `0025`–`0026` KM/comprovantes/histórico) and configure environment variables (ver `docs/NOTIFICATIONS.md` para `FCM_SERVER_KEY` e `docs/ERP_INTEGRATION.md`).
- Conta Azul: HTTP real `POST /v1/venda` quando `ERP_CONTA_AZUL_ACCESS_TOKEN` + IDs estao definidos (`src/lib/integrations/conta-azul-http.ts`).
- Omie: HTTP real `IncluirContaReceber` quando credenciais + `ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR` estao definidos (`src/lib/integrations/omie-http.ts`).
- Fila ERP e reconciliacao: `GET`/`POST /api/integrations/jobs`; `POST /api/jobs/reconcile/run` com escopo por tenant (sessao ou `?tenant_id=` em job maquina); `runReconciliation` em `src/lib/jobs/processors.ts`.
- Testes: `npm test` (`tests/*.test.ts`).
- RLS: ver migracoes `0003` e `0007` para `erp_entity_mappings`; `0021` para leitura de `audit_events`; RBAC nas rotas de integracao.
- API: JWT Supabase (`Authorization: Bearer`) + perfil em `profiles`; em `production` sem `TRUST_HEADER_AUTH=true`, cabecalhos `x-role` nao concedem sessao (papel `guest`).
- Push motorista: `docs/NOTIFICATIONS.md`; `FCM_SERVER_KEY` + `POST /api/drivers/push-token` antes de esperar entrega.
- Staging smoke: `npm run test:e2e-staging` ou `npm run test:e2e-staging-all`. Workflow `.github/workflows/staging-e2e.yml`.
- Playwright: `npm run test:e2e-playwright:install` depois `npm run test:e2e-playwright` (CI inclui job `playwright`).
- Comprovantes motorista: upload `POST /api/finance/driver-payables/:id/proof/upload` (multipart) ou URL em `.../proof`.
- Portal cliente: solicitação com `clientId` da sessão, centros de custo, rastreio copiar/abrir.
- Relatório: `GET /api/reports/operations/trips?format=json|csv|html` (HTML → imprimir/PDF no browser) + painel no dashboard.
- Financeiro: `mark-paid` / `reopen` / `cancel` em receivables e driver payables; realtime (`0032`–`0033`).
- Fechamento mensal: CSV, DRE JSON/HTML, `close-all` (+ enqueue ERP), reabrir, painel (`0034`).
- Rastreio público: mapa Leaflet (origem/destino/GPS) em `/r/[token]`.
- Motorista: `DriverTripsPanel` com corridas atribuídas e fluxo de estados.
- Webhook ERP: inbound + caixa de entrada (`GET/POST` inbox, painel financeiro, realtime `0031`).
- E2E: relatório operacional no smoke staging; Playwright `e2e/pilot-client-awaiting.spec.ts` (CI); `e2e/pilot-client-driver-staging.spec.ts` (staging); `e2e/pilot-operational-queue-mock.spec.ts`, `e2e/pilot-operational-claim-mock.spec.ts`; `test:e2e-playwright:staging`.
- Notificações: push motorista + in-app financeiro/admin/operador; eventos `operations.*`; painéis agenda/despacho; smoke staging `in-app`; RLS (`0035`–`0037`).
- **Histórico operacional CSV:** `GET /api/operations/history?format=csv` (até 500 linhas, mesmos filtros); botão **CSV** no painel; `docs/E2E_PLAYWRIGHT.md`.
- **Fila `unclaimedOnly`:** leitura até 300 viagens, filtro de claim em memória, `total` coerente com a lista filtrada.
- **Queries partilhadas:** `parseOperationsHistoryQuery`, `parseOperationsQueueQuery` + testes `tests/operations-query-parse.test.ts`.
- **Utilitários:** `endOfUtcDayIsoFromDateInput`, `buildOperationsHistoryCsv`, `canListAuditEvents` com testes dedicados.
- **Resumo financeiro corrida:** `GET /api/trips/[id]/finance-summary` expõe `planned_km`, `actual_km`, `km_source`, `km_updated_at` a quem pode ler a viagem.
- **Auditoria API:** `GET /api/audit-events` via `canListAuditEvents` (`admin` / `operador` / `financeiro`).
- **Multiatendimento:** claim com nomes de operador; `ensureOperationalClaimForMutation` (auto-assume quando `require_operational_claim=false`); guardas em aprovar/despacho/ofertas/notas.
- **Fila e histórico:** `GET /api/operations/queue` (filtros `client_id`, `driver_id`, `scheduled_from`/`scheduled_to`, `unclaimedOnly`); `GET /api/operations/history` (+ `scheduled_to`); painéis com filtros, janela na fila, histórico «Até» data, «Carregar mais»; rastreio público com `km_updated_at`; timeline com `profile_names`, eventos de `notification_jobs`, auditorias relacionadas por `metadata.trip_id` / títulos financeiros / ofertas, rótulos legíveis e resumo de metadados.
- **Pós-corrida:** `runPostTripAutomation` recalcula KM, `ensureDriverPayableFromTripFinancials` e `ensureAccountsReceivableFromTripFinancials` (se `trip_financials`), auditoria `finance.driver_payable_auto` / `finance.accounts_receivable_auto`, in-app AR; push + in-app **pagável motorista** só quando o pagável é **criado automaticamente** neste passo (coexistência com `trip.completed`); falhas não bloqueiam conclusão e ficam auditadas como `trip.post_trip_automation_failed`.
- **KM real por GPS:** `actualKmFromTrail` ordena por horário, ignora coordenadas inválidas e descarta saltos acima do limite por segmento para evitar distorção por ponto ruim.
- **Hardening KM:** cálculo planeado valida coordenadas finitas dentro da faixa WGS84; formatação ignora KM `NaN`/infinito.
- **Comprovantes motorista:** `loadDriverPayableForSession` com intent `read`/`write`; motorista lista e envia comprovantes nos próprios títulos.
- **Financeiro motorista D+30:** helper central `driverPayableDueDate` para vencimento previsto em 30 dias; listagem de pagáveis expõe `days_until_due`, `overdue` e `due_label` para painel motorista/financeiro.
- **Hardening financeiro motorista:** pagáveis cancelados exibem `due_label` como `Cancelado` e nunca aparecem como atrasados.
- **UX multiatendimento:** evento `prime:operational-claim-changed` refresca barra de claim após aprovar/despacho/reatribuir/oferta.
- **Multiatendimento refinado:** claim ativo expõe idade em minutos e flag `stale` (45 min); conflitos orientam operador quando o atendimento parece antigo.
- **In-app operacional (equipa):** após despacho directo, aprovação de oferta ou reatribuição, jobs `operations.trip_dispatched` / `operations.trip_reassigned` para `admin`/`operador` (exclui opcionalmente o actor); textos em `presentInAppNotification`.
- **In-app status operacional:** transições para cancelada, em deslocamento, no local e no-show notificam `admin`/`operador` via `operations.trip_cancelled`, `operations.trip_on_the_way`, `operations.trip_arrived` e `operations.trip_no_show`.
- **Hardening no-show:** regra central `isOperationalTripStatusEvent` controla quais status disparam aviso à equipa; `no_show` permanece histórico operacional e liberta motorista para `online`.
- **Push motorista no-show:** `notifyTripStatusTransition` também envia `trip.no_show` ao motorista quando a corrida atribuída é encerrada como no-show, com `title`/`body` amigáveis no payload push.
- **Estado operacional motorista:** coluna `drivers.operational_status` (`online`, `ocupado`, `deslocando`, `no_local`, `em_atendimento`, `offline`), endpoint `/api/drivers/operational-status`, painel no PWA motorista e atualização automática em despacho/reatribuição/transições.
- **Hardening status motorista:** motorista não consegue alternar manualmente online/offline enquanto possui corrida ativa atribuída; o status operacional segue a corrida até terminal.
- **Regras de despacho:** despacho direto, reatribuição e ofertas validam motorista ativo/no tenant, bloqueiam motorista offline e recusam conflito de agenda dentro do buffer operacional.
- **Hardening de ofertas:** aprovação de oferta revalida status da viagem, claim operacional, candidatura, aceite do motorista e disponibilidade antes de atribuir a corrida.
- **Hardening expiração de oferta:** aceite e aprovação usam a mesma regra de expiração, tratando timestamp inválido como expirado e bloqueando aprovação tardia.
- **Hardening financeiro:** regeneração financeira da viagem não reabre automaticamente contas/pagáveis já `paid` ou `cancelled`; exige reabertura explícita antes de recalcular.
- **Hardening filtros operacionais:** `scheduled_from`/`scheduled_to` em fila e histórico exigem datetime ISO com offset antes de chegar ao banco.
- **Hardening notificações:** falhas retryable em `notification_jobs` respeitam `attempt_count`, `max_attempts` e `next_retry_at` antes de virar erro final.
- **Hardening pós-mutação:** notificações de despacho/reatribuição/oferta são best-effort após alterar a viagem, evitando erro tardio quando a mutação principal já foi persistida.
- **Hardening rastreio público:** criação de token público retorna sucesso após persistir o token mesmo se a auditoria pós-criação falhar.
- **Tracking público realtime:** regra central `isPublicTrackTerminalStatus` encerra SSE em status finais (`completed`, `cancelled`, `rejected`, `no_show`) e reduz retry no cliente mantendo polling lento como fallback.
- **Hardening smoke HTTP/preflight:** `scripts/e2e-smoke-http.mjs`, `scripts/vercel-preflight.mjs`, `scripts/go-live-preflight.mjs` e `scripts/erp-preflight.mjs` usam loader comum de envs (`.env.supabase.local`, `.env.vercel.local`, `.env.local`, `.env`), aceitam `BASE_URL` como fallback local para `NEXT_PUBLIC_BASE_URL`, detectam Deployment Protection da Vercel, aceitam `VERCEL_AUTOMATION_BYPASS_SECRET` para validar deployment protegido e falham com diagnóstico accionável, evitando falso `200 OK`/HTML na página de login da Vercel.
- **Bootstrap operacional:** `npm run bootstrap:prime` configura tenant Prime Vitória, admin owner, cliente/motorista/veículo e corridas teste de forma idempotente.
- **Ofertas agenda + motorista PWA:** painéis `TripAgendaOffersPanel`, `DriverOffersPanel`.
- **Frota/clientes:** painéis com editar/desactivar; Sentry opcional; `GET /api/integrations/status`; `npm run erp:preflight`.

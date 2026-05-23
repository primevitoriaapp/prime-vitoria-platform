# Prime Vitoria - Implementation Summary

## Ciclo A — secrets produção (2026-05-19)

- **Implementado:** `scripts/generate-production-secrets.mjs`, `vercel-secrets-apply.mjs`, `docs/PRODUCTION_SECRETS_SETUP.md`; 5 secrets de máquina em Vercel Production; redeploy; `ok cron notifications (200)`.
- **Preparado:** npm scripts `secrets:generate*` e `vercel:secrets:apply`.
- **Adiado:** `FCM_SERVER_KEY` + `NEXT_PUBLIC_FIREBASE_*` (Firebase manual); secrets em Preview.
- **Riscos mitigados:** crons 401; jobs sem bearer; documentação de rotação de secrets.

## Fase 1 — fila operacional e smoke motorista (2026-05-19, ciclo 2)

- **Implementado:** migração `0040_operations_queue_index` (índice parcial fila activa); `validateOperationalTransition` na API de status; seed staging com corrida dirigida em `dispatched`; E2E motorista (aceite + bloqueio `completed` inválido).
- **Preparado:** mensagens de transição centralizadas para Fase 2 (`tripFsm`).
- **Adiado:** `FCM_SERVER_KEY` em produção; módulo FSM completo.
- **Riscos mitigados:** queries lentas na fila; motorista a saltar estados; regressão de transições (testes + E2E).

## Fase 1 — transições e portal cliente (2026-05-19)

- **Implementado:** `planOperationalTransition` + reatribuição com passo `reassigned` quando necessário; cancelamento pelo cliente (`requested`/`approved` → `cancelled`) na API e botão no portal; testes `tests/trip-operational-transition.test.ts`.
- **Preparado:** mesma matriz `ALLOWED_TRANSITIONS` reutilizável na Fase 2 (`tripFsm` central).
- **Adiado:** FCM em produção, módulo FSM completo.
- **Riscos mitigados:** reatribuição saltando estados inválidos; cliente cancelando após despacho; regressão da máquina de estados (testes).

## Architecture foundation (2026-05-19)

- **Documentação:** `docs/architecture/` — ARCHITECTURE, SECURITY_MODEL, RBAC_MATRIX, FSM_FLOW, TENANT_MODEL, ROADMAP_PHASES.
- **Diretriz:** MVP operacional rápido + fundação enterprise (multi-tenant, RBAC, FSM, white-label preparado) sem rewrite.
- **Implementado neste ciclo (código):** seed `tenant_id` em `accounts_receivable`; histórico operacional sem coluna `trips.updated_at`; E2E staging alinhado ao RBAC.
- **Preparado:** estados alvo FSM, capabilities futuras, modelo `tenant_settings`, offline-first na Fase 3.
- **Adiado:** módulo FSM central, JWT claims, testes tenant leakage CI, PWA offline UX.
- **Riscos mitigados:** vazamento cross-tenant (RLS+scope); permissões incorretas (E2E por papel); API histórico quebrada em produção.

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
- **Hardening multiatendimento:** guardas de ação e mutação usam a mesma mensagem de conflito, incluindo idade/stale do claim quando disponível.
- **Fila e histórico:** `GET /api/operations/queue` (filtros `client_id`, `driver_id`, `scheduled_from`/`scheduled_to`, `unclaimedOnly`); `GET /api/operations/history` (+ `scheduled_to`); painéis com filtros, janela na fila, histórico «Até» data, «Carregar mais»; rastreio público com `km_updated_at`; timeline com `profile_names`, eventos de `notification_jobs`, auditorias relacionadas por `metadata.trip_id` / títulos financeiros / ofertas, rótulos legíveis e resumo de metadados.
- **Hardening timeline:** resumos de metadados traduzem chaves operacionais comuns (`driver_id`, `amount`, `planned_km`, `km_source`, etc.) para rótulos amigáveis.
- **Pós-corrida:** `runPostTripAutomation` recalcula KM, `ensureDriverPayableFromTripFinancials` e `ensureAccountsReceivableFromTripFinancials` (se `trip_financials`), auditoria `finance.driver_payable_auto` / `finance.accounts_receivable_auto`, in-app AR; push + in-app **pagável motorista** só quando o pagável é **criado automaticamente** neste passo (coexistência com `trip.completed`); falhas não bloqueiam conclusão e ficam auditadas como `trip.post_trip_automation_failed`.
- **Hardening pós-corrida:** `postTripKmSource` prioriza trilha GPS, preserva `manual` quando já havia KM real sem nova trilha e usa `coords` apenas para cálculo planeado.
- **KM real por GPS:** `actualKmFromTrail` ordena por horário, ignora coordenadas inválidas e descarta saltos acima do limite por segmento para evitar distorção por ponto ruim.
- **Hardening KM:** cálculo planeado valida coordenadas finitas dentro da faixa WGS84; formatação ignora KM `NaN`/infinito.
- **Comprovantes motorista:** `loadDriverPayableForSession` com intent `read`/`write`; motorista lista e envia comprovantes nos próprios títulos.
- **Financeiro motorista D+30:** helper central `driverPayableDueDate` para vencimento previsto em 30 dias; listagem de pagáveis expõe `days_until_due`, `overdue` e `due_label` para painel motorista/financeiro.
- **Hardening financeiro motorista:** pagáveis cancelados exibem `due_label` como `Cancelado` e nunca aparecem como atrasados.
- **Hardening valor motorista:** criação automática de pagável aceita apenas `amount_driver` positivo e finito, evitando título com `NaN`/infinito.
- **Hardening filtros motorista:** listagem de pagáveis aceita `due_from`/`due_to` com datas reais e intervalo válido, preservando escopo próprio do motorista.
- **Hardening valor recebível:** criação automática de conta a receber aceita apenas `amount_client` positivo e finito.
- **UX multiatendimento:** evento `prime:operational-claim-changed` refresca barra de claim após aprovar/despacho/reatribuir/oferta.
- **Multiatendimento refinado:** claim ativo expõe idade em minutos e flag `stale` (45 min); conflitos orientam operador quando o atendimento parece antigo.
- **In-app operacional (equipa):** após despacho directo, aprovação de oferta ou reatribuição, jobs `operations.trip_dispatched` / `operations.trip_reassigned` para `admin`/`operador` (exclui opcionalmente o actor); textos em `presentInAppNotification`.
- **In-app status operacional:** transições para cancelada, em deslocamento, no local e no-show notificam `admin`/`operador` via `operations.trip_cancelled`, `operations.trip_on_the_way`, `operations.trip_arrived` e `operations.trip_no_show`.
- **Hardening no-show:** regra central `isOperationalTripStatusEvent` controla quais status disparam aviso à equipa; `no_show` permanece histórico operacional e liberta motorista para `online`.
- **Push motorista no-show:** `notifyTripStatusTransition` também envia `trip.no_show` ao motorista quando a corrida atribuída é encerrada como no-show, com `title`/`body` amigáveis no payload push.
- **Push motorista despacho:** fluxos de despacho direto, reatribuição, aprovação de oferta e auto-despacho usam payload canónico `trip.dispatched` com `title`/`body` amigáveis.
- **Estado operacional motorista:** coluna `drivers.operational_status` (`online`, `ocupado`, `deslocando`, `no_local`, `em_atendimento`, `offline`), endpoint `/api/drivers/operational-status`, painel no PWA motorista e atualização automática em despacho/reatribuição/transições.
- **Hardening status motorista:** motorista não consegue alternar manualmente online/offline enquanto possui corrida ativa atribuída; o status operacional segue a corrida até terminal.
- **Regras de despacho:** despacho direto, reatribuição e ofertas validam motorista ativo/no tenant, bloqueiam motorista offline e recusam conflito de agenda dentro do buffer operacional.
- **Hardening conflito despacho:** `reassigned` também conta como status ativo para bloquear conflito de agenda durante novo despacho.
- **Hardening de ofertas:** aprovação de oferta revalida status da viagem, claim operacional, candidatura, aceite do motorista e disponibilidade antes de atribuir a corrida.
- **Hardening expiração de oferta:** aceite e aprovação usam a mesma regra de expiração, tratando timestamp inválido como expirado e bloqueando aprovação tardia.
- **Hardening financeiro:** regeneração financeira da viagem não reabre automaticamente contas/pagáveis já `paid` ou `cancelled`; exige reabertura explícita antes de recalcular.
- **Hardening baixa financeira:** endpoints `mark-paid` de recebíveis e pagáveis compartilham schema e exigem `paid_at` ISO com offset quando informado.
- **Hardening fechamentos:** agregação de fechamentos normaliza valores não finitos (`NaN`/infinito) como zero antes de somar e persistir rascunhos.
- **Hardening filtros de fechamento:** listagem/export CSV de fechamentos valida datas `YYYY-MM-DD` reais e recusa período invertido antes da consulta.
- **Hardening DRE:** resumo de fechamentos trata valores não finitos como zero antes de agregar e arredondar indicadores.
- **Hardening posição DRE:** somatórios de contas abertas/pagas usam helper finito, evitando `NaN`/infinito em JSON e HTML.
- **Hardening filtros DRE:** endpoint de resumo DRE valida datas reais `YYYY-MM-DD` com helper compartilhado e recusa período invertido.
- **Hardening recebíveis:** listagem de contas a receber usa parser puro e aceita filtros `due_from`/`due_to` com datas reais e intervalo válido.
- **Hardening relatórios operacionais:** relatório HTML de viagens formata KM com uma casa decimal e oculta valores não finitos antes de imprimir/PDF.
- **Hardening CSV:** exports neutralizam células de texto que parecem fórmulas de planilha e histórico operacional reutiliza o escape CSV comum.
- **Hardening filtros de relatório:** `scheduledFrom`/`scheduledTo` do relatório operacional exigem datetime ISO com offset e recusam intervalo invertido antes de consultar o banco.
- **Hardening filtros de viagens:** listagem `GET /api/trips` usa parser puro, exige datetime ISO com offset e recusa intervalo invertido.
- **Hardening filtros operacionais:** `scheduled_from`/`scheduled_to` em fila e histórico exigem datetime ISO com offset antes de chegar ao banco.
- **Hardening notificações:** falhas retryable em `notification_jobs` respeitam `attempt_count`, `max_attempts` e `next_retry_at` antes de virar erro final.
- **Hardening FCM:** erros permanentes do FCM legacy (`NotRegistered`, `InvalidRegistration`, etc.) são classificados como não-retryable para evitar reprocessamento inútil.
- **Hardening pós-mutação:** notificações de despacho/reatribuição/oferta são best-effort após alterar a viagem, evitando erro tardio quando a mutação principal já foi persistida.
- **Hardening rastreio público:** criação de token público retorna sucesso após persistir o token mesmo se a auditoria pós-criação falhar.
- **Tracking público realtime:** regra central `isPublicTrackTerminalStatus` encerra SSE em status finais (`completed`, `cancelled`, `rejected`, `no_show`) e reduz retry no cliente mantendo polling lento como fallback.
- **Hardening payload público:** rastreio do passageiro valida coordenadas e KM finitos antes de expor origem/destino, localização atual e valores de distância.
- **Hardening smoke HTTP/preflight:** `scripts/e2e-smoke-http.mjs`, `scripts/vercel-preflight.mjs`, `scripts/go-live-preflight.mjs` e `scripts/erp-preflight.mjs` usam loader comum de envs (`.env.supabase.local`, `.env.vercel.local`, `.env.local`, `.env`), aceitam `BASE_URL` como fallback local para `NEXT_PUBLIC_BASE_URL`, detectam Deployment Protection da Vercel, aceitam `VERCEL_AUTOMATION_BYPASS_SECRET` para validar deployment protegido e falham com diagnóstico accionável, evitando falso `200 OK`/HTML na página de login da Vercel.
- **Bootstrap operacional:** `npm run bootstrap:prime` configura tenant Prime Vitória, admin owner, cliente/motorista/veículo e corridas teste de forma idempotente.
- **Ofertas agenda + motorista PWA:** painéis `TripAgendaOffersPanel`, `DriverOffersPanel`.
- **Frota/clientes:** painéis com editar/desactivar; Sentry opcional; `GET /api/integrations/status`; `npm run erp:preflight`.

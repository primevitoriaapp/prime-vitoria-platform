# Prime Vitoria Platform

Plataforma operacional de transporte executivo corporativo, com foco em agendamento, despacho híbrido, acompanhamento operacional e controle financeiro.

## Stack

- Next.js + React + TypeScript
- Supabase (PostgreSQL + Auth)
- OpenStreetMap + Leaflet (mapa)
- PWA motorista
- Adaptadores financeiros (Conta Azul e Omie)

## Estrutura entregue

- `supabase/migrations/0001_init.sql`: schema completo + índices + triggers + RLS
- `supabase/migrations/0002_dispatch_offer_and_jobs.sql`: despacho por oferta, fechamento e reconciliacao
- `src/lib/domain`: regras centrais de negócio
- `src/lib/jobs/processors.ts`: workers de notificacao, ERP e reconciliacao
- `src/app/api`: endpoints operacionais, financeiros e integração ERP
- `src/app/(admin|driver|client)`: painéis base
- `public/manifest.webmanifest` + `public/sw.js`: base PWA
- `docs/GO_LIVE_RUNBOOK.md`: checklist operacional de entrada em producao
- `docs/ERP_INTEGRATION.md`: variaveis de ambiente e fluxo Conta Azul / Omie
- `docs/architecture/`: arquitetura, segurança, RBAC, FSM, tenant e roadmap por fases

## Rodar localmente (após instalar npm)

```bash
npm install
npm run dev
```

## Testes

```bash
npm test
```

## Histórico operacional (API)

- `GET /api/trips/:id/operational-timeline` aceita query opcional `audit_prefix` (até 80 caracteres). Quando definido, filtra entradas `kind=audit` cujo `action` começa por esse prefixo (ex.: `finance.`, `trip.`). A resposta inclui `audit_prefix` para eco do filtro aplicado.

# FCM / PWA — readiness checklist (prep)

> Nada activado por defeito. MVP opera sem push real até secrets configurados.

## Estado actual (código)

| Componente | Ficheiro | Status |
|------------|----------|--------|
| PWA motorista | `src/app/(driver)/`, `manifest-motorista.json` | Implementado |
| Service worker | `public/driver/service-worker.js` | Implementado |
| Registo token | `src/components/driver-push-register.tsx` | Implementado |
| Envio jobs | `src/lib/jobs/processors.ts` + `fcm-legacy.ts` | Requer `FCM_SERVER_KEY` |
| Health flag | `src/lib/server/health-check.ts` | Reporta `fcm` configurado |

## Variáveis obrigatórias (Vercel Preview + Production)

| Variável | Tipo |
|----------|------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | público |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | público |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | público |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | público |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | público |
| `NEXT_PUBLIC_FCM_VAPID_KEY` | público |
| `FCM_SERVER_KEY` | secreto |

Opcional futuro: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (HTTP v1).

## Smoke operacional

Roteiro PASS/FAIL: **[FCM_OPERATIONAL_SMOKE.md](./FCM_OPERATIONAL_SMOKE.md)**

API motorista: `GET /api/drivers/push-readiness` (token + env, sem secrets).

## Validação (quando secrets existirem)

1. Login motorista `/driver`
2. Activar notificações (ou colar token em staging)
3. `POST /api/drivers/push-token` → 200
4. Despacho teste → job notification → `POST /api/jobs/notifications/process` com `CRON_SECRET`
5. Dispositivo recebe push

## Feature flags

Push **não** depende de flags de pricing. Despacho e FSM mantêm-se MVP.

## Referências

- `docs/FIREBASE_FCM_SETUP.md` — passo a passo Firebase Console
- `docs/STAGING_E2E.md` — smoke push em staging

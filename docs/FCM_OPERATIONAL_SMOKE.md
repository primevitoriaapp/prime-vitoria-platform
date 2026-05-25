# Smoke operacional — FCM / Push motorista

> Complementa [OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md) e [FIREBASE_FCM_SETUP.md](./FIREBASE_FCM_SETUP.md).  
> **Sem deploy produção** até PASS humano + FCM mínimo.

**Registo oficial:** [STAGING_VALIDATION_EXECUTION_LOG.md](./STAGING_VALIDATION_EXECUTION_LOG.md)

**Tempo estimado:** 15–25 min (após secrets Vercel configurados)

---

## Pré-requisitos

| Variável | Onde |
|----------|------|
| `FCM_SERVER_KEY` | Vercel Preview (secreto) |
| `NEXT_PUBLIC_FIREBASE_*` + `NEXT_PUBLIC_FCM_VAPID_KEY` | Vercel Preview |
| `NOTIFICATION_JOB_PROCESS_SECRET` | Já no projeto (cron/manual) |

**Health detalhado:** `GET /api/health?detailed=1` → `checks.fcm`, `fcm_web`, `fcm_operational_ready`

---

## Checklist PASS/FAIL

| # | Passo | PASS | FAIL |
|---|--------|------|------|
| F1 | Motorista `/driver` — banner **Push activo** (ou instrução clara) | ☐ | ☐ |
| F2 | `GET /api/drivers/push-readiness` → `tokenRegistered: true` | ☐ | ☐ |
| F3 | Permissão browser + `POST /api/drivers/push-token` 200 | ☐ | ☐ |
| F4 | Operador despacha → job `notification_jobs` queued | ☐ | ☐ |
| F5 | Job processado (auto após despacho ou `POST .../notifications/process`) → `success` | ☐ | ☐ |
| F6 | Dispositivo recebe notificação (app fechada ou background) | ☐ | ☐ |
| F7 | Toque na notificação → `/driver?trip=` + destaque na lista | ☐ | ☐ |
| F8 | App aberta: push em foreground actualiza lista + mensagem | ☐ | ☐ |
| F9 | Sem FCM: fallback **Actualizar** + Realtime ainda funciona | ☐ | ☐ |

**Global FCM:** ☐ PASS · ☐ FAIL

---

## Fluxo detalhado

### 1. Registo (motorista)

1. Login `staging-motorista@example.com` → `/driver`
2. Banner no topo indica estado
3. Secção **Notificações push** (`#push-setup`) → **Activar notificações**
4. Confirmar rede: `POST /api/drivers/push-token`

**Fallback:** colar token FCM manual (staging sem Firebase Web).

### 2. Despacho (operador)

1. Despachar corrida para o motorista com token
2. Verificar `notification_jobs` (painel em `/dispatch` ou Supabase)
3. O sistema tenta **processar jobs imediatamente** após despacho (best-effort)
4. Se `FCM_SERVER_KEY` ausente: job fica `error` com `PUSH_PROVIDER_NOT_CONFIGURED` — **não é PASS**

### 3. Recepção (motorista)

- Notificação local via `public/driver/service-worker.js` (data `title`/`body`/`tripId`)
- Lista **Corridas activas** actualiza via Realtime + evento foreground

### 4. Fallback sem push

| Situação | Comportamento esperado |
|----------|------------------------|
| Sem Firebase Web | Banner “Modo sem push automático” + Actualizar |
| Sem `FCM_SERVER_KEY` | Token ok, banner “servidor push pendente” |
| Permissão negada | Botão activar + manual token |

---

## Blockers

| ID | Blocker | Acção humana |
|----|---------|--------------|
| FB1 | Secrets Firebase não no Vercel | [FIREBASE_FCM_SETUP.md](./FIREBASE_FCM_SETUP.md) |
| FB2 | Legacy API desactivada no Google Cloud | Activar FCM API + server key |
| FB3 | Motorista offline | Painel disponibilidade → Online |

---

## Comandos úteis

```bash
# Processar fila manualmente (operador com capability ou Bearer secret)
curl -X POST "$BASE_URL/api/jobs/notifications/process?limit=10" \
  -H "Authorization: Bearer $NOTIFICATION_JOB_PROCESS_SECRET"

# Readiness motorista (sessão motorista)
curl "$BASE_URL/api/drivers/push-readiness" -H "Cookie: ..."
```

---

## Histórico

| Data | Ambiente | F1–F9 | Notas |
|------|----------|-------|-------|
| | | | |

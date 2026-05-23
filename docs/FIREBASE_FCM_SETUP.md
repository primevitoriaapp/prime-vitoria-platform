# Firebase / FCM — Setup passo a passo (PWA motorista)

Guia para configurar push notifications ponta-a-ponta no Prime Vitória.

> **Bloqueio actual:** sem as variáveis abaixo no Vercel (Production + Preview), o fluxo **não pode ser validado em produção**. Pare aqui e configure manualmente antes de testar push real.

---

## Pré-requisitos

- Conta Google / Firebase
- Acesso admin ao projecto Vercel `prime-vitoria-web`
- URL de produção: `https://prime-vitoria-web.vercel.app`
- PWA motorista: `/driver`

---

## Passo 1 — Criar projecto Firebase

1. Abra [Firebase Console](https://console.firebase.google.com/)
2. **Add project** (ou use projecto existente)
3. Anote o **Project ID** (ex.: `prime-vitoria-prod`)

---

## Passo 2 — Registar app Web

1. No projecto → **Project settings** (engrenagem) → **Your apps**
2. Clique **Web** (`</>`)
3. Nickname: `Prime Vitória PWA Motorista`
4. **Não** active Analytics se quiser setup mínimo
5. Copie o objeto `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

---

## Passo 3 — Cloud Messaging (VAPID + Server key)

1. **Project settings** → separador **Cloud Messaging**
2. **Web Push certificates** → **Generate key pair**
   - Copie a chave pública → `NEXT_PUBLIC_FCM_VAPID_KEY`
3. **Cloud Messaging API (Legacy)** — precisa estar activa
   - Se não vir "Server key", em [Google Cloud Console](https://console.cloud.google.com/) → APIs → active **Firebase Cloud Messaging API**
   - Volte ao Firebase → **Cloud Messaging** → copie **Server key** → `FCM_SERVER_KEY`

> O processor actual usa **FCM HTTP legacy** (`https://fcm.googleapis.com/fcm/send`). A chave de servidor é obrigatória.

---

## Passo 4 — Service Worker (já no repo)

O PWA motorista usa:

- `public/driver/firebase-messaging-sw.js` (ou equivalente no repo)
- `DriverPushRegister` em `/driver` — regista token via `POST /api/drivers/push-token`

Não é necessário alterar código se as env vars estiverem correctas.

---

## Passo 5 — Variáveis no Vercel

Configure em **Production** e **Preview** (Settings → Environment Variables):

| Variável | Origem | Obrigatória |
|----------|--------|-------------|
| `FCM_SERVER_KEY` | Firebase → Cloud Messaging → Server key | **Sim** (envio server-side) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | firebaseConfig.apiKey | **Sim** |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain | **Sim** |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | firebaseConfig.projectId | **Sim** |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId | **Sim** |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | firebaseConfig.appId | **Sim** |
| `NEXT_PUBLIC_FCM_VAPID_KEY` | Web Push certificates (chave pública) | **Sim** |

**Já configuradas (ciclo anterior — não repetir):**

- `CRON_SECRET`
- `NOTIFICATION_JOB_PROCESS_SECRET`
- `ERP_JOB_PROCESS_SECRET`, `RECONCILE_JOB_PROCESS_SECRET`, `DISPATCH_DIRECT_SCAN_SECRET`
- Variáveis Supabase (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`)

**Reservadas (não usadas pelo processor actual):**

- `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` — futuro FCM HTTP v1

Após guardar variáveis → **Redeploy** Production (Deployments → ⋯ → Redeploy).

---

## Passo 6 — Validar fluxo operacional (checklist)

### 6.1 Registo do token (motorista)

1. Login motorista staging: `/driver`
2. Browser pede permissão de notificações → **Allow**
3. Consola rede: `POST /api/drivers/push-token` → **200**
4. Supabase: tabela `driver_push_tokens` tem linha para o motorista

**Fallback staging:** sem Firebase Web, colar token FCM manualmente no painel (ver `docs/NOTIFICATIONS.md`).

### 6.2 Despacho → push

1. Login operador → despachar corrida para motorista com token registado
2. `notification_jobs`: novo job `recipientType=driver`, `status=queued`
3. Cron ou manual: `POST /api/jobs/notifications/process` com `Authorization: Bearer $NOTIFICATION_JOB_PROCESS_SECRET`
4. Job passa a `success`; `notifications.status=sent`

### 6.3 Motorista recebe e opera

1. Dispositivo/PWA mostra notificação (service worker)
2. Motorista abre corrida → **Aceitar**
3. Altera status (ex.: `on_the_way` → `arrived` → `completed`)
4. Painel operação (`/operations` ou fila) reflecte mudanças em **realtime**

### 6.4 Erros comuns

| Sintoma | Causa provável | Acção |
|---------|----------------|-------|
| `PUSH_PROVIDER_NOT_CONFIGURED` | `FCM_SERVER_KEY` ausente | Configurar no Vercel + redeploy |
| Token não regista | `NEXT_PUBLIC_FIREBASE_*` ou VAPID ausentes | Completar vars públicas |
| Job `error` / `InvalidRegistration` | Token expirado | Motorista reabrir `/driver` |
| Notificação não aparece | Permissão negada no browser | Reset permissões do site |
| Cron não processa | `CRON_SECRET` / cron Vercel | Ver `docs/VERCEL_CRONS.md` |

---

## Passo 7 — Comandos úteis

```bash
# Processar fila manualmente (substituir URL e secret)
curl -sS -X POST "https://prime-vitoria-web.vercel.app/api/jobs/notifications/process?limit=10" \
  -H "Authorization: Bearer $NOTIFICATION_JOB_PROCESS_SECRET"

# Ver fila (sessão operador autenticada)
curl -sS "https://prime-vitoria-web.vercel.app/api/jobs/notifications?status=queued" \
  -H "Cookie: ..."
```

---

## O que falta da sua parte (acção manual)

Configure **exactamente** estas 7 variáveis no Vercel e faça redeploy:

1. `FCM_SERVER_KEY`
2. `NEXT_PUBLIC_FIREBASE_API_KEY`
3. `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
4. `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
5. `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
6. `NEXT_PUBLIC_FIREBASE_APP_ID`
7. `NEXT_PUBLIC_FCM_VAPID_KEY`

Quando estiverem activas, avise para validarmos o fluxo completo **despacho → push → aceite → status → realtime** em produção/staging.

---

## Referências no repo

- `docs/NOTIFICATIONS.md` — arquitectura da fila
- `docs/PRODUCTION_SECRETS_SETUP.md` — secrets de máquina
- `src/components/driver-push-register.tsx` — registo PWA
- `src/lib/jobs/processors.ts` — envio FCM legacy

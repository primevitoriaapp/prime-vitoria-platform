/**
 * FCM HTTP legacy (Authorization: key=...) — ainda suportado para envio data-only.
 * Preferir migracao para FCM HTTP v1 quando houver service account em JSON.
 */

export type FcmLegacySendResult =
  | { ok: true }
  | { ok: false; reason: string };

const NON_RETRYABLE_FCM_ERRORS = [
  "invalidregistration",
  "notregistered",
  "mismatchsenderid",
  "invalidpackagename"
];

/** Converte payload job para mapa de strings exigido pelo FCM data. */
export function fcmDataFromPayload(payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

/** Interpreta corpo JSON da API legacy `fcm/send`. */
export function parseFcmLegacySendJson(json: unknown): FcmLegacySendResult {
  if (!json || typeof json !== "object") {
    return { ok: false, reason: "FCM resposta invalida (nao JSON)" };
  }
  const o = json as Record<string, unknown>;
  const success = typeof o.success === "number" ? o.success : 0;
  const failure = typeof o.failure === "number" ? o.failure : 0;
  if (failure === 0 && success > 0) {
    return { ok: true };
  }
  const results = Array.isArray(o.results) ? o.results : [];
  const first = results[0] as Record<string, unknown> | undefined;
  const err = first?.error != null ? String(first.error) : undefined;
  if (err) {
    return { ok: false, reason: `FCM: ${err}` };
  }
  const msg = typeof o.message === "string" ? o.message : "FCM sem sucesso e sem detalhe";
  return { ok: false, reason: msg };
}

export function fcmLegacyFailureIsRetryable(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return !NON_RETRYABLE_FCM_ERRORS.some((error) => normalized.includes(error));
}

export async function sendFcmLegacyDataMessage(opts: {
  serverKey: string;
  registrationToken: string;
  data: Record<string, string>;
}): Promise<FcmLegacySendResult> {
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${opts.serverKey}`
    },
    body: JSON.stringify({
      to: opts.registrationToken,
      data: opts.data,
      priority: "high",
      content_available: true
    })
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, reason: `FCM HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  if (!res.ok) {
    const msg =
      typeof (parsed as { error?: string }).error === "string"
        ? (parsed as { error: string }).error
        : `HTTP ${res.status}`;
    return { ok: false, reason: msg };
  }

  return parseFcmLegacySendJson(parsed);
}

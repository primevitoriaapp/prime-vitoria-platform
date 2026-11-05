const RESEND_API = "https://api.resend.com/emails";

/** Remetente padrão — domínio primevitoria.com verificado no Resend (03/11/2026). */
export const DEFAULT_OPERATIONAL_EMAIL_FROM = "Prime Vitória <operacao@primevitoria.com>";

/** Respostas vão para a caixa real da Prime (operacao@ só envia). */
export const DEFAULT_EMAIL_REPLY_TO = "contato@primevitoria.com";

/** Remetente em uso: OPERATIONAL_EMAIL_FROM do Vercel, a não ser que ainda aponte para o endereço de teste. */
export function resolveEmailFrom(): string {
  const env = process.env.OPERATIONAL_EMAIL_FROM?.trim();
  if (env && !env.includes("resend.dev")) return env;
  return DEFAULT_OPERATIONAL_EMAIL_FROM;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  /** Respostas do cliente vão para este endereço. */
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  /** Anexos (conteúdo em base64), ex.: convite de agenda .ics. */
  attachments?: { filename: string; content: string; content_type?: string }[];
};

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string; skipped?: boolean };

function resendApiKeyStatus(): { present: boolean; length: number } {
  const raw = process.env.RESEND_API_KEY;
  const trimmed = raw?.trim() ?? "";
  return { present: trimmed.length > 0, length: trimmed.length };
}

/** Envio transacional via Resend (RESEND_API_KEY). */
export async function sendOperationalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const keyStatus = resendApiKeyStatus();

  if (!apiKey) {
    console.warn("[email.resend] RESEND_API_KEY nao configurada", {
      envDefined: process.env.RESEND_API_KEY !== undefined,
      ...keyStatus,
      subject: input.subject,
      to: input.to
    });
    return { ok: false, reason: "RESEND_API_KEY nao configurado", skipped: true };
  }

  const from = input.from?.trim() || resolveEmailFrom();

  const to = Array.isArray(input.to) ? input.to : [input.to];

  console.info("[email.resend] enviando", {
    from,
    to,
    subject: input.subject,
    apiKeyPresent: keyStatus.present,
    apiKeyLength: keyStatus.length
  });

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? undefined,
      reply_to: input.replyTo ?? DEFAULT_EMAIL_REPLY_TO,
      cc: input.cc?.length ? input.cc : undefined,
      bcc: input.bcc?.length ? input.bcc : undefined,
      attachments: input.attachments?.length ? input.attachments : undefined
    })
  });

  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[email.resend] falhou", {
      status: res.status,
      from,
      to,
      subject: input.subject,
      body: bodyText.slice(0, 500)
    });
    return { ok: false, reason: bodyText || `HTTP ${res.status}` };
  }

  let json: { id?: string } = {};
  try {
    json = JSON.parse(bodyText) as { id?: string };
  } catch {
    json = {};
  }

  console.info("[email.resend] enviado", {
    status: res.status,
    id: json.id ?? null,
    from,
    to,
    subject: input.subject
  });

  return { ok: true, id: json.id };
}

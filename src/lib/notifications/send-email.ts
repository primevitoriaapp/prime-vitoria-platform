const RESEND_API = "https://api.resend.com/emails";

/** Remetente padrão — domínio de teste Resend (sem verificação de domínio). */
export const DEFAULT_OPERATIONAL_EMAIL_FROM = "onboarding@resend.dev";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
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

  const from =
    input.from?.trim() ||
    process.env.OPERATIONAL_EMAIL_FROM?.trim() ||
    DEFAULT_OPERATIONAL_EMAIL_FROM;

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
      html: input.html ?? undefined
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

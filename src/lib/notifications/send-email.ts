const RESEND_API = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string; skipped?: boolean };

/** Envio transacional via Resend (RESEND_API_KEY). */
export async function sendOperationalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email.skipped]", input.subject, "→", input.to);
    }
    return { ok: false, reason: "RESEND_API_KEY nao configurado", skipped: true };
  }

  const from =
    process.env.OPERATIONAL_EMAIL_FROM?.trim() ?? "Prime Vitória <contato@primevitoria.com>";

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html ?? undefined
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, reason: body || `HTTP ${res.status}` };
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: json.id };
}

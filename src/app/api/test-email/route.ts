import { fail, ok } from "@/lib/server/http";
import {
  DEFAULT_OPERATIONAL_EMAIL_FROM,
  sendOperationalEmail
} from "@/lib/notifications/send-email";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

const TEST_RECIPIENT = "contatoprimevix@gmail.com";

function resendEnvDiagnostics() {
  const raw = process.env.RESEND_API_KEY;
  const trimmed = raw?.trim() ?? "";
  return {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    resendApiKeyDefined: raw !== undefined,
    resendApiKeyPresent: trimmed.length > 0,
    resendApiKeyLength: trimmed.length,
    resendApiKeyPrefix: trimmed.length >= 3 ? `${trimmed.slice(0, 3)}…` : null,
    operationalEmailFrom: process.env.OPERATIONAL_EMAIL_FROM?.trim() || null,
    effectiveFrom: process.env.OPERATIONAL_EMAIL_FROM?.trim() || DEFAULT_OPERATIONAL_EMAIL_FROM,
    to: TEST_RECIPIENT
  };
}

/** Diagnóstico directo do Resend — remover ou proteger após validação. */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && cronSecret.length >= 16 && !isCronSecretAuthorized(request)) {
    const key = new URL(request.url).searchParams.get("key")?.trim();
    if (key !== cronSecret) {
      return fail(
        "UNAUTHORIZED",
        "Protegido por CRON_SECRET. Use Authorization: Bearer <CRON_SECRET> ou ?key=<CRON_SECRET>.",
        401
      );
    }
  }

  const diagnostics = resendEnvDiagnostics();

  if (!diagnostics.resendApiKeyPresent) {
    return fail("RESEND_API_KEY_MISSING", "RESEND_API_KEY ausente ou vazia no ambiente.", 503, JSON.stringify(diagnostics));
  }

  const subject = `[Prime Vitória] Teste Resend ${new Date().toISOString()}`;
  const sendResult = await sendOperationalEmail({
    to: TEST_RECIPIENT,
    from: DEFAULT_OPERATIONAL_EMAIL_FROM,
    subject,
    text: "Email de teste enviado por GET /api/test-email.",
    html: "<p>Email de teste enviado por <code>GET /api/test-email</code>.</p>"
  });

  if (!sendResult.ok) {
    return fail(
      sendResult.skipped ? "RESEND_SKIPPED" : "RESEND_SEND_FAILED",
      sendResult.reason,
      sendResult.skipped ? 503 : 502,
      JSON.stringify({ diagnostics, resendError: sendResult.reason })
    );
  }

  return ok({
    sent: true,
    resendId: sendResult.id,
    diagnostics,
    message: `Email de teste enviado para ${TEST_RECIPIENT}.`
  });
}

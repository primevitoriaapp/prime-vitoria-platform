import { createHmac, timingSafeEqual } from "node:crypto";

/** Valida assinatura HMAC-SHA256 do corpo (header `x-webhook-signature` hex ou `sha256=` prefix). */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.trim() || !secret.trim()) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  let provided = signatureHeader.trim();
  if (provided.startsWith("sha256=")) provided = provided.slice(7);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

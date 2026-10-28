import { normalizeWhatsappPhone } from "@/lib/messages/templates";

/**
 * Envio automático pelo WhatsApp da central via Z-API (conexão por QR Code).
 * Sem as variáveis ZAPI_*, o sistema só monta a mensagem e a central envia com 1 clique.
 */
export function whatsappProviderConfigured(): boolean {
  return Boolean(process.env.ZAPI_INSTANCE_ID?.trim() && process.env.ZAPI_TOKEN?.trim());
}

export type WhatsappSendResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendWhatsappText(phoneRaw: string, text: string): Promise<WhatsappSendResult> {
  const instance = process.env.ZAPI_INSTANCE_ID?.trim();
  const token = process.env.ZAPI_TOKEN?.trim();
  const clientToken = process.env.ZAPI_CLIENT_TOKEN?.trim();
  if (!instance || !token) return { ok: false, error: "WhatsApp automático não configurado" };
  const phone = normalizeWhatsappPhone(phoneRaw);
  if (!phone) return { ok: false, error: "Telefone inválido" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://api.z-api.io/instances/${encodeURIComponent(instance)}/token/${encodeURIComponent(token)}/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(clientToken ? { "Client-Token": clientToken } : {}) },
      body: JSON.stringify({ phone, message: text }),
      signal: controller.signal,
      cache: "no-store"
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; zaapId?: string; id?: string; error?: string; message?: string };
    if (!res.ok || body.error) return { ok: false, error: body.error || body.message || `HTTP ${res.status}` };
    return { ok: true, id: body.messageId ?? body.zaapId ?? body.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "AbortError" ? "Tempo esgotado" : "Falha de rede" };
  } finally {
    clearTimeout(timer);
  }
}

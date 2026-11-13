import { db } from "@/lib/server/db";
import { normalizeWhatsappPhone } from "@/lib/messages/templates";
import { PASSENGER_TEMPLATES, type PassengerTemplate } from "@/lib/messages/passenger-whatsapp-templates";

/**
 * WhatsApp oficial (API da Meta, sem intermediário). A configuração fica no banco
 * (Integrações): o painel só mostra o final da chave.
 *
 * Modos:
 * - "desligado": nada acontece.
 * - "teste": o sistema monta e registra cada aviso (aparece em Integrações), mas não envia.
 * - "ligado": envia de verdade.
 */
export type WhatsappCloudMode = "desligado" | "teste" | "ligado";
export type WhatsappCloudConfig = { phone_number_id: string; waba_id: string; token: string; mode: WhatsappCloudMode };

const GRAPH = "https://graph.facebook.com/v23.0";

export async function getWhatsappCloudConfig(): Promise<WhatsappCloudConfig> {
  const { data } = await db.from("app_secrets").select("value").eq("key", "whatsapp_cloud").maybeSingle();
  const v = (data?.value ?? {}) as Partial<WhatsappCloudConfig>;
  const mode: WhatsappCloudMode = v.mode === "ligado" || v.mode === "teste" ? v.mode : "desligado";
  return { phone_number_id: String(v.phone_number_id ?? ""), waba_id: String(v.waba_id ?? ""), token: String(v.token ?? ""), mode };
}

export function cloudReady(c: WhatsappCloudConfig): boolean {
  return c.phone_number_id.length > 5 && c.token.length > 20;
}

export type CloudSendResult = { ok: true; id: string | null } | { ok: false; error: string };

async function graph(c: WhatsappCloudConfig, path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${GRAPH}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
      cache: "no-store"
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function graphError(body: Record<string, unknown>, status: number): string {
  const e = body.error as { message?: string; error_user_msg?: string } | undefined;
  return e?.error_user_msg || e?.message || `HTTP ${status}`;
}

/** Envia um modelo aprovado. `buttonSuffix` completa o link do botão (ex.: código do acompanhamento). */
export async function sendWhatsappTemplate(
  c: WhatsappCloudConfig,
  phoneRaw: string,
  t: PassengerTemplate,
  params: string[],
  buttonSuffix?: string | null
): Promise<CloudSendResult> {
  const to = normalizeWhatsappPhone(phoneRaw);
  if (!to) return { ok: false, error: "Telefone inválido" };
  const components: unknown[] = [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text || "-" })) }];
  if (t.button && buttonSuffix) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: buttonSuffix }] });
  try {
    const r = await graph(c, `${encodeURIComponent(c.phone_number_id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: t.name, language: { code: "pt_BR" }, components } })
    });
    if (!r.ok) return { ok: false, error: graphError(r.body, r.status) };
    const msgs = r.body.messages as { id?: string }[] | undefined;
    return { ok: true, id: msgs?.[0]?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "AbortError" ? "Tempo esgotado" : "Falha de rede" };
  }
}

/** Pede à Meta a aprovação dos 3 modelos (categoria utilidade, português). */
export async function submitPassengerTemplates(c: WhatsappCloudConfig): Promise<{ name: string; ok: boolean; detail: string }[]> {
  const out: { name: string; ok: boolean; detail: string }[] = [];
  for (const t of PASSENGER_TEMPLATES) {
    const components: unknown[] = [{ type: "BODY", text: t.body, example: { body_text: [t.example] } }];
    if (t.button) components.push({ type: "BUTTONS", buttons: [{ type: "URL", text: t.button.text, url: `${t.button.urlPrefix}{{1}}`, example: [`${t.button.urlPrefix}exemplo123`] }] });
    try {
      const r = await graph(c, `${encodeURIComponent(c.waba_id)}/message_templates`, {
        method: "POST",
        body: JSON.stringify({ name: t.name, language: "pt_BR", category: "UTILITY", components })
      });
      out.push({ name: t.name, ok: r.ok, detail: r.ok ? String(r.body.status ?? "enviado para análise") : graphError(r.body, r.status) });
    } catch {
      out.push({ name: t.name, ok: false, detail: "Falha de rede" });
    }
  }
  return out;
}

/** Situação de cada modelo na Meta (aprovado, em análise, recusado) e a categoria que a Meta deu. */
export async function passengerTemplatesStatus(c: WhatsappCloudConfig): Promise<{ name: string; status: string; category: string | null }[]> {
  const r = await graph(c, `${encodeURIComponent(c.waba_id)}/message_templates?fields=name,status,category&limit=100`).catch(() => null);
  const list = ((r?.body.data as { name: string; status: string; category?: string }[] | undefined) ?? []).filter((x) => PASSENGER_TEMPLATES.some((t) => t.name === x.name));
  return PASSENGER_TEMPLATES.map((t) => {
    const f = list.find((x) => x.name === t.name);
    return { name: t.name, status: f?.status ?? "não enviado", category: f?.category ?? null };
  });
}

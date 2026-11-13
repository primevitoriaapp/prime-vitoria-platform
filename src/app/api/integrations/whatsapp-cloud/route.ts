import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { cloudReady, getWhatsappCloudConfig, passengerTemplatesStatus, submitPassengerTemplates } from "@/lib/messages/whatsapp-cloud";
import { PASSENGER_TEMPLATES, renderPassengerTemplate } from "@/lib/messages/passenger-whatsapp-templates";

/** WhatsApp oficial: configuração, modelos e últimos avisos. Só admin. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const c = await getWhatsappCloudConfig();
    const ready = cloudReady(c);
    const templates = PASSENGER_TEMPLATES.map((t) => ({
      kind: t.kind,
      name: t.name,
      label: t.label,
      when: t.when,
      preview: renderPassengerTemplate(t.kind, t.example, "exemplo")
    }));
    const status = ready && c.waba_id ? await passengerTemplatesStatus(c).catch(() => []) : [];
    const { data: log } = await db
      .from("passenger_notifications")
      .select("id, trip_id, kind, phone, person_name, status, detail, preview, created_at")
      .eq("tenant_id", session.tenantId as string)
      .order("created_at", { ascending: false })
      .limit(30);
    return ok({
      mode: c.mode,
      configured: ready,
      phone_number_id: c.phone_number_id || null,
      waba_id: c.waba_id || null,
      token_tail: c.token ? c.token.slice(-4) : null,
      templates,
      template_status: status,
      log: (log ?? []).map((r) => ({ ...r, phone: String(r.phone).replace(/^(\d{4})\d+(\d{4})$/, "$1•••$2") }))
    });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const body = z
      .object({
        mode: z.enum(["desligado", "teste", "ligado"]),
        phone_number_id: z.string().trim().regex(/^\d*$/, "O ID do número tem só números").max(40).optional(),
        waba_id: z.string().trim().regex(/^\d*$/, "O ID da conta tem só números").max(40).optional(),
        token: z.string().trim().max(600).optional()
      })
      .parse(await request.json());
    const cur = await getWhatsappCloudConfig();
    const next = {
      mode: body.mode,
      phone_number_id: body.phone_number_id ?? cur.phone_number_id,
      waba_id: body.waba_id ?? cur.waba_id,
      token: body.token && body.token.length > 20 ? body.token : cur.token
    };
    if (next.mode === "ligado" && !cloudReady(next)) return fail("NOT_CONFIGURED", "Para ligar, preencha o ID do número e a chave de acesso da Meta. Enquanto isso, use o modo teste.", 400);
    const { error } = await db.from("app_secrets").upsert({ key: "whatsapp_cloud", value: next }, { onConflict: "key" });
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId: session.tenantId as string, actorUserId: session.userId, action: "integration.whatsapp_cloud", entityType: "integration", entityId: null, metadata: { mode: next.mode }, request });
    return ok({ mode: next.mode, configured: cloudReady(next), token_tail: next.token ? next.token.slice(-4) : null });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", e.issues[0]?.message ?? "Dados inválidos", 400);
    return mapApiError(e);
  }
}

/** Envia os 3 modelos para aprovação da Meta. */
export async function POST() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const c = await getWhatsappCloudConfig();
    if (!cloudReady(c) || !c.waba_id) return fail("NOT_CONFIGURED", "Preencha o ID da conta WhatsApp, o ID do número e a chave antes de enviar os modelos.", 400);
    return ok({ results: await submitPassengerTemplates(c) });
  } catch (e) {
    return mapApiError(e);
  }
}

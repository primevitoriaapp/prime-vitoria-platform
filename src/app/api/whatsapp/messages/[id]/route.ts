import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { sendWhatsappText, whatsappProviderConfigured } from "@/lib/messages/whatsapp-provider";

const bodySchema = z.object({
  action: z.enum(["enviar", "marcar_enviada", "ignorar"]),
  body: z.string().min(1).max(4000).optional(),
  phone: z.string().max(30).optional()
});

/**
 * enviar: manda pelo WhatsApp automático (se ligado);
 * marcar_enviada: a central mandou pelo próprio WhatsApp (1 clique);
 * ignorar: não precisa mandar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const input = bodySchema.parse(await request.json());

    const { data: msg } = await db.from("whatsapp_messages").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!msg) return fail("MESSAGE_NOT_FOUND", "Mensagem não encontrada", 404);

    const text = input.body ?? (msg.body as string);
    const phone = input.phone ?? (msg.phone as string | null);
    const patch: Record<string, unknown> = { body: text, phone, sent_by: session.userId };

    if (input.action === "ignorar") {
      patch.status = "ignorada";
    } else if (input.action === "marcar_enviada") {
      patch.status = "enviada";
      patch.sent_at = new Date().toISOString();
      patch.error = null;
    } else {
      if (!whatsappProviderConfigured()) return fail("WHATSAPP_NOT_CONFIGURED", "WhatsApp automático ainda não conectado", 400);
      if (!phone) return fail("NO_PHONE", "Informe o telefone", 400);
      const res = await sendWhatsappText(phone, text);
      Object.assign(
        patch,
        res.ok
          ? { status: "enviada", sent_at: new Date().toISOString(), provider_message_id: res.id, error: null }
          : { status: "falhou", error: res.error }
      );
    }

    const { data, error } = await db.from("whatsapp_messages").update(patch).eq("id", id).select("*").single();
    if (error) return fail("MESSAGE_UPDATE_FAILED", error.message, 500);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}

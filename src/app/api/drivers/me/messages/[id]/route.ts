import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { pushToStaff } from "@/lib/push/web-push";

const schema = z.object({ action: z.enum(["read", "interessado", "indisponivel"]) });

/** Motorista marca como lido ou responde ao aviso. "Interessado" avisa a central na hora. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { action } = schema.parse(await request.json());
    const { data: msg } = await db.from("driver_messages").select("id, title, active, expires_at").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!msg) return fail("NOT_FOUND", "Aviso não encontrado", 404);
    const now = new Date().toISOString();
    const { data: prev } = await db.from("driver_message_receipts").select("read_at, answer").eq("message_id", id).eq("driver_id", session.driverId).maybeSingle();
    const row: Record<string, unknown> = { message_id: id, driver_id: session.driverId, read_at: prev?.read_at ?? now };
    if (action !== "read") {
      if (!msg.active || (msg.expires_at && Date.parse(msg.expires_at as string) < Date.now())) {
        return fail("CLOSED", "Esse aviso já foi encerrado pela central.", 409);
      }
      row.answer = action;
      row.answered_at = now;
    }
    const { error } = await db.from("driver_message_receipts").upsert(row, { onConflict: "message_id,driver_id" });
    if (error) return fail("SAVE_FAILED", error.message, 500);
    if (action === "interessado" && prev?.answer !== "interessado") {
      const { data: d } = await db.from("drivers").select("full_name").eq("id", session.driverId).maybeSingle();
      await pushToStaff(tenantId, {
        title: `🙋 ${String(d?.full_name ?? "Motorista").split(" ").slice(0, 2).join(" ")} está disponível`,
        body: `Respondeu ao aviso: ${msg.title}`,
        url: "/drivers/avisos",
        tag: `aviso-${id}-${session.driverId}`
      }).catch(() => 0);
    }
    return ok({ saved: true });
  } catch (e) {
    return mapApiError(e);
  }
}

import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({ driver_id: z.string().uuid() });

/** Vincula um motorista já cadastrado ao parceiro (ele passa a ser parceiro, não funcionário). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { driver_id } = bodySchema.parse(await request.json());
    const { data: partner } = await db.from("partners").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!partner) return fail("NOT_FOUND", "Parceiro não encontrado", 404);
    const { error } = await db
      .from("drivers")
      .update({ partner_id: id, employment_type: "parceiro" })
      .eq("id", driver_id)
      .eq("tenant_id", tenantId);
    if (error) return fail("LINK_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "partner.driver_link", entityType: "partner", entityId: id, metadata: { driver_id }, request });
    return ok({ linked: true });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const driverId = z.string().uuid().parse(new URL(request.url).searchParams.get("driver_id"));
    const { error } = await db.from("drivers").update({ partner_id: null }).eq("id", driverId).eq("partner_id", id).eq("tenant_id", tenantId);
    if (error) return fail("UNLINK_FAILED", error.message, 500);
    return ok({ unlinked: true });
  } catch (error) {
    return mapApiError(error);
  }
}

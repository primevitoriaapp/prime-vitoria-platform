import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { hashDriverPin } from "@/lib/auth/driver-pin-crypto";
import { CLUB_ENTITIES, isClubEntity } from "@/lib/club/admin-schemas";

async function staff() {
  const session = await getSessionContext();
  if (!["admin", "operador"].includes(session.role)) return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { entity, id } = await params;
    if (!isClubEntity(entity)) return fail("NOT_FOUND", "Não encontrado", 404);
    const cfg = CLUB_ENTITIES[entity];
    const body = cfg.schema.partial().parse(await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { ...body };
    delete patch.partner_id;
    if (entity === "partners" && typeof body.validation_pin === "string") patch.validation_pin_hash = hashDriverPin(body.validation_pin);
    delete patch.validation_pin;
    if (["partners", "benefits", "prospects"].includes(entity)) patch.updated_at = new Date().toISOString();
    const { data, error } = await db.from(cfg.table).update(patch).eq("id", id).eq("tenant_id", tenantId).select("*").maybeSingle();
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    if (!data) return fail("NOT_FOUND", "Não encontrado", 404);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: `club.${entity}.update`,
      entityType: cfg.table,
      entityId: id,
      metadata: { fields: Object.keys(body).filter((k) => k !== "validation_pin").concat(body.validation_pin ? ["pin"] : []) },
      request
    });
    const { validation_pin_hash, ...rest } = data as Record<string, unknown>;
    return ok({ ...rest, has_pin: Boolean(validation_pin_hash) });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { entity, id } = await params;
    if (!isClubEntity(entity)) return fail("NOT_FOUND", "Não encontrado", 404);
    const cfg = CLUB_ENTITIES[entity];
    // Parceiro com usos registrados não some do histórico: vira "inativo".
    if (entity === "partners") {
      const { count } = await db.from("club_redemptions").select("id", { count: "exact", head: true }).eq("partner_id", id);
      if ((count ?? 0) > 0) {
        await db.from("club_partners").update({ status: "inativo", updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId);
        return ok({ deactivated: true });
      }
    }
    if (entity === "benefits") {
      const { count } = await db.from("club_redemptions").select("id", { count: "exact", head: true }).eq("benefit_id", id);
      if ((count ?? 0) > 0) {
        await db.from("club_benefits").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId);
        return ok({ deactivated: true });
      }
    }
    const { error } = await db.from(cfg.table).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("DELETE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: `club.${entity}.delete`, entityType: cfg.table, entityId: id, metadata: {}, request });
    return ok({ deleted: true });
  } catch (e) {
    return mapApiError(e);
  }
}

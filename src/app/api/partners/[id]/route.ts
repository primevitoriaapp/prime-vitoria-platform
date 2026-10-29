import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { cleanPartner, partnerSchema, vehicleLimitFor } from "@/lib/partners/partners";

const staff = (r: string) => r === "admin" || r === "operador";

async function loadPartner(tenantId: string, id: string) {
  const { data } = await db.from("partners").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return data;
}

/** Parceiro com a frota e os motoristas dele. */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role) && session.role !== "financeiro") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const partner = await loadPartner(tenantId, id);
    if (!partner) return fail("NOT_FOUND", "Parceiro não encontrado", 404);
    const [{ data: vehicles }, { data: drivers }] = await Promise.all([
      db.from("vehicles").select("id, plate, model, brand, color, model_year, vehicle_category_id, active").eq("partner_id", id).eq("active", true).order("plate"),
      db.from("drivers").select("id, full_name, cpf, whatsapp, phone, active, vehicle_category_ids").eq("partner_id", id).neq("active", false).order("full_name")
    ]);
    return ok({ ...partner, vehicle_limit: vehicleLimitFor(partner.type as string), vehicles: vehicles ?? [], drivers: drivers ?? [] });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const partner = await loadPartner(tenantId, id);
    if (!partner) return fail("NOT_FOUND", "Parceiro não encontrado", 404);
    const body = cleanPartner(partnerSchema.parse(await request.json()));
    if (body.type === "PF" && partner.type === "PJ") {
      const { count } = await db.from("vehicles").select("id", { count: "exact", head: true }).eq("partner_id", id).eq("active", true);
      if ((count ?? 0) > 2) return fail("TOO_MANY_VEHICLES", "Pessoa física pode ter no máximo 2 carros. Remova carros antes de mudar.", 409);
    }
    const { data, error } = await db.from("partners").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) {
      if (error.code === "23505") return fail("DOCUMENT_IN_USE", "Já existe um parceiro com este CPF/CNPJ.", 409);
      return fail("UPDATE_FAILED", error.message, 500);
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "partner.update", entityType: "partner", entityId: id, request });
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}

/** Exclui o parceiro: carros e motoristas dele ficam sem parceiro (não são apagados). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o administrador exclui parceiros", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const partner = await loadPartner(tenantId, id);
    if (!partner) return fail("NOT_FOUND", "Parceiro não encontrado", 404);
    const { error } = await db.from("partners").delete().eq("id", id);
    if (error) return fail("DELETE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "partner.delete", entityType: "partner", entityId: id, metadata: { name: partner.name }, request });
    return ok({ deleted: true });
  } catch (error) {
    return mapApiError(error);
  }
}

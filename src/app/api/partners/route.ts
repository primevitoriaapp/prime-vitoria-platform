import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { cleanPartner, partnerSchema, vehicleLimitFor } from "@/lib/partners/partners";

const staff = (r: string) => r === "admin" || r === "operador";

/** Parceiros (PF ou PJ) que prestam serviço para a Prime, com quantos carros e motoristas têm. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role) && session.role !== "financeiro") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";
    let q = db.from("partners").select("*").eq("tenant_id", tenantId).order("name");
    if (!includeInactive) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) return fail("LIST_FAILED", error.message, 500);
    const ids = (data ?? []).map((p) => p.id as string);
    const [veh, drv] = ids.length
      ? await Promise.all([
          db.from("vehicles").select("partner_id").in("partner_id", ids).eq("active", true),
          db.from("drivers").select("partner_id").in("partner_id", ids).neq("active", false)
        ])
      : [{ data: [] }, { data: [] }];
    const count = (rows: { partner_id: unknown }[] | null | undefined, id: string) => (rows ?? []).filter((r) => r.partner_id === id).length;
    return ok(
      (data ?? []).map((p) => ({
        ...p,
        vehicle_count: count(veh.data as { partner_id: unknown }[], p.id as string),
        driver_count: count(drv.data as { partner_id: unknown }[], p.id as string),
        vehicle_limit: vehicleLimitFor(p.type as string)
      }))
    );
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const body = cleanPartner(partnerSchema.parse(await request.json()));
    const { data, error } = await db.from("partners").insert({ ...body, tenant_id: tenantId }).select("*").single();
    if (error) {
      if (error.code === "23505") return fail("DOCUMENT_IN_USE", "Já existe um parceiro com este CPF/CNPJ.", 409);
      return fail("CREATE_FAILED", error.message, 500);
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "partner.create", entityType: "partner", entityId: data.id as string, metadata: { name: body.name }, request });
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

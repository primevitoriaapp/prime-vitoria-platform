import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { partnerVehicleSchema, vehicleLimitFor } from "@/lib/partners/partners";

/** Cadastra um carro na frota do parceiro (PF: até 2). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: partner } = await db.from("partners").select("id, type, name").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!partner) return fail("NOT_FOUND", "Parceiro não encontrado", 404);
    const body = partnerVehicleSchema.parse(await request.json());
    const limit = vehicleLimitFor(partner.type as string);
    if (limit != null) {
      const { count } = await db.from("vehicles").select("id", { count: "exact", head: true }).eq("partner_id", id).eq("active", true);
      if ((count ?? 0) >= limit) return fail("VEHICLE_LIMIT", `Pessoa física pode cadastrar no máximo ${limit} carros.`, 409);
    }
    let category: string | null = null;
    let capacity: number | null = null;
    if (body.vehicle_category_id) {
      const { data: cat } = await db.from("vehicle_categories").select("name, passengers").eq("id", body.vehicle_category_id).eq("tenant_id", tenantId).maybeSingle();
      category = (cat?.name as string) ?? null;
      capacity = (cat?.passengers as number) ?? null;
    }
    const { data, error } = await db
      .from("vehicles")
      .insert({
        tenant_id: tenantId,
        partner_id: id,
        plate: body.plate.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        model: body.model,
        brand: body.brand ?? null,
        color: body.color ?? null,
        model_year: body.model_year ?? null,
        vehicle_category_id: body.vehicle_category_id ?? null,
        category,
        capacity,
        active: true
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return fail("PLATE_IN_USE", "Já existe um carro com esta placa.", 409);
      return fail("CREATE_FAILED", error.message, 500);
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "partner.vehicle_add", entityType: "partner", entityId: id, metadata: { plate: data.plate }, request });
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

/** Tira o carro da frota do parceiro (fica desativado, o histórico das corridas continua). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const vehicleId = z.string().uuid().parse(new URL(request.url).searchParams.get("vehicle_id"));
    const { error } = await db.from("vehicles").update({ active: false }).eq("id", vehicleId).eq("partner_id", id).eq("tenant_id", tenantId);
    if (error) return fail("REMOVE_FAILED", error.message, 500);
    return ok({ removed: true });
  } catch (error) {
    return mapApiError(error);
  }
}

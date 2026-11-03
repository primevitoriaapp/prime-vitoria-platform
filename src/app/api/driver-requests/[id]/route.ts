import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { normalizePlate } from "@/lib/drivers/change-request-rules";
import { pushToDriver } from "@/lib/push/web-push";

const body = z.object({ action: z.enum(["approve", "reject"]), note: z.string().trim().max(300).optional() });

/** A central aprova (e aplica no cadastro) ou recusa o pedido do motorista. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = body.parse(await request.json());
    const { data: r } = await db.from("driver_change_requests").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!r) return fail("NOT_FOUND", "Pedido não encontrado", 404);
    if (r.status !== "pendente") return fail("ALREADY_DONE", "Este pedido já foi analisado", 409);
    const p = r.payload as Record<string, unknown>;
    const driverId = r.driver_id as string;

    if (b.action === "approve") {
      if (r.kind === "pix") {
        const { error } = await db.from("drivers").update({ pix_key: p.pix_key }).eq("id", driverId);
        if (error) return fail("APPLY_FAILED", error.message, 500);
      } else if (r.kind === "cnh") {
        const { error } = await db.from("drivers").update({ cnh_number: p.cnh_number, cnh_category: p.cnh_category, cnh_expires_at: p.cnh_expires_at, cnh_expiry: p.cnh_expires_at }).eq("id", driverId);
        if (error) return fail("APPLY_FAILED", error.message, 500);
      } else if (r.kind === "vehicle") {
        const plate = normalizePlate(p.plate as string);
        const { data: all } = await db.from("vehicles").select("id, plate").eq("tenant_id", tenantId);
        const existing = (all ?? []).find((v) => normalizePlate(v.plate as string) === plate);
        let catName: string | null = null;
        if (p.vehicle_category_id) {
          const { data: c } = await db.from("vehicle_categories").select("name").eq("id", p.vehicle_category_id as string).maybeSingle();
          catName = (c?.name as string | null) ?? null;
        }
        const fields = {
          brand: p.brand,
          model: p.model,
          plate: p.plate,
          color: p.color ?? null,
          model_year: p.model_year ?? null,
          vehicle_category_id: p.vehicle_category_id ?? null,
          ...(catName ? { category: catName } : {}),
          active: true
        };
        let vehicleId: string;
        if (existing) {
          const { error } = await db.from("vehicles").update(fields).eq("id", existing.id);
          if (error) return fail("APPLY_FAILED", error.message, 500);
          vehicleId = existing.id as string;
        } else {
          const { data: v, error } = await db.from("vehicles").insert({ tenant_id: tenantId, ...fields }).select("id").single();
          if (error) return fail("APPLY_FAILED", error.message, 500);
          vehicleId = v.id as string;
        }
        const now = new Date().toISOString();
        await db.from("driver_vehicle_links").update({ is_default: false, active: false, end_at: now }).eq("driver_id", driverId).eq("active", true).neq("vehicle_id", vehicleId);
        const { data: link } = await db.from("driver_vehicle_links").select("id").eq("driver_id", driverId).eq("vehicle_id", vehicleId).eq("active", true).is("end_at", null).maybeSingle();
        if (link) await db.from("driver_vehicle_links").update({ is_default: true }).eq("id", link.id);
        else await db.from("driver_vehicle_links").insert({ driver_id: driverId, vehicle_id: vehicleId, is_default: true, active: true });
      }
    }

    const { error } = await db
      .from("driver_change_requests")
      .update({ status: b.action === "approve" ? "aprovado" : "recusado", review_note: b.note || null, reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    const label = r.kind === "vehicle" ? "troca de veículo" : r.kind === "cnh" ? "CNH nova" : "chave PIX";
    await pushToDriver(tenantId, driverId, {
      title: b.action === "approve" ? `✅ ${label} aprovada` : `Pedido de ${label} recusado`,
      body: b.action === "approve" ? "Seu cadastro já foi atualizado." : b.note || "Fale com a central para saber o motivo.",
      url: "/driver?aba=perfil",
      tag: `dcr-${id}`
    }).catch(() => 0);
    return ok({ status: b.action === "approve" ? "aprovado" : "recusado" });
  } catch (error) {
    return mapApiError(error);
  }
}

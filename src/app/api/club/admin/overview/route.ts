import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { partnerIsLive } from "@/lib/club/club";

async function staff() {
  const session = await getSessionContext();
  if (!["admin", "operador"].includes(session.role)) return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

/** Números do clube, usos recentes, motoristas e quem está bloqueado. */
export async function GET() {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const [partners, benefits, drivers, redemptions, prospects] = await Promise.all([
      db.from("club_partners").select("id, name, status, publish_at").eq("tenant_id", tenantId),
      db.from("club_benefits").select("id, active, valid_until").eq("tenant_id", tenantId),
      db.from("drivers").select("id, full_name, active, club_blocked, employment_type").eq("tenant_id", tenantId).order("full_name"),
      db
        .from("club_redemptions")
        .select("id, created_at, saved_amount, purchase_amount, status, source, driver_id, partner_id, benefit_id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300),
      db.from("club_prospects").select("stage").eq("tenant_id", tenantId)
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const reds = (redemptions.data ?? []).filter((r) => r.status === "registrado");
    const pName = new Map((partners.data ?? []).map((p) => [p.id as string, p.name as string]));
    const dName = new Map((drivers.data ?? []).map((d) => [d.id as string, d.full_name as string]));
    const stages: Record<string, number> = {};
    (prospects.data ?? []).forEach((p) => (stages[p.stage as string] = (stages[p.stage as string] ?? 0) + 1));
    const ym = today.slice(0, 7);
    return ok({
      partners_total: (partners.data ?? []).length,
      partners_live: (partners.data ?? []).filter((p) => partnerIsLive(p as { status: string; publish_at: string | null })).length,
      benefits_active: (benefits.data ?? []).filter((b) => b.active && (!b.valid_until || (b.valid_until as string) >= today)).length,
      drivers_eligible: (drivers.data ?? []).filter((d) => d.active && !d.club_blocked).length,
      saved_total: reds.reduce((a, r) => a + Number(r.saved_amount ?? 0), 0),
      saved_month: reds.filter((r) => String(r.created_at).slice(0, 7) === ym).reduce((a, r) => a + Number(r.saved_amount ?? 0), 0),
      uses_month: reds.filter((r) => String(r.created_at).slice(0, 7) === ym).length,
      stages,
      drivers: (drivers.data ?? []).filter((d) => d.active).map((d) => ({ id: d.id, name: d.full_name, blocked: Boolean(d.club_blocked) })),
      redemptions: (redemptions.data ?? []).slice(0, 100).map((r) => ({
        id: r.id,
        at: r.created_at,
        driver: dName.get(r.driver_id as string) ?? "Motorista",
        partner: pName.get(r.partner_id as string) ?? "Parceiro",
        saved: Number(r.saved_amount ?? 0),
        purchase: r.purchase_amount == null ? null : Number(r.purchase_amount),
        status: r.status,
        source: r.source
      }))
    });
  } catch (e) {
    return mapApiError(e);
  }
}

const patchSchema = z.object({
  driver_id: z.string().uuid().optional(),
  blocked: z.boolean().optional(),
  redemption_id: z.string().uuid().optional(),
  cancel: z.boolean().optional()
});

/** Bloqueia/libera um motorista no clube, ou cancela um uso registrado por engano. */
export async function PATCH(request: Request) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const b = patchSchema.parse(await request.json());
    if (b.driver_id && b.blocked !== undefined) {
      const { error } = await db.from("drivers").update({ club_blocked: b.blocked }).eq("id", b.driver_id).eq("tenant_id", tenantId);
      if (error) return fail("UPDATE_FAILED", error.message, 500);
    }
    if (b.redemption_id && b.cancel) {
      const { error } = await db.from("club_redemptions").update({ status: "cancelado" }).eq("id", b.redemption_id).eq("tenant_id", tenantId);
      if (error) return fail("UPDATE_FAILED", error.message, 500);
    }
    return ok({ saved: true });
  } catch (e) {
    return mapApiError(e);
  }
}

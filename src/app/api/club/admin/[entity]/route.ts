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

/** Lista (categorias, parceiros, filiais, benefícios, prospecção). ?partner=<id> filtra filiais e benefícios. */
export async function GET(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { entity } = await params;
    if (!isClubEntity(entity)) return fail("NOT_FOUND", "Não encontrado", 404);
    const cfg = CLUB_ENTITIES[entity];
    const partner = new URL(request.url).searchParams.get("partner");
    let q = db.from(cfg.table).select("*").eq("tenant_id", tenantId).order(cfg.order, { ascending: entity !== "prospects" }).limit(1000);
    if (partner && (entity === "branches" || entity === "benefits")) q = q.eq("partner_id", partner);
    const { data, error } = await q;
    if (error) return fail("LIST_FAILED", error.message, 500);
    // Nunca devolve o hash do PIN; só se existe.
    const rows = (data ?? []).map((r: Record<string, unknown>) => {
      if (entity !== "partners") return r;
      const { validation_pin_hash, ...rest } = r;
      return { ...rest, has_pin: Boolean(validation_pin_hash) };
    });
    return ok(rows);
  } catch (e) {
    return mapApiError(e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { entity } = await params;
    if (!isClubEntity(entity)) return fail("NOT_FOUND", "Não encontrado", 404);
    const cfg = CLUB_ENTITIES[entity];
    const body = cfg.schema.parse(await request.json()) as Record<string, unknown>;
    if ((entity === "branches" || entity === "benefits") && !body.partner_id) return fail("VALIDATION", "Informe o estabelecimento", 400);
    const row: Record<string, unknown> = { ...body, tenant_id: tenantId };
    if (entity === "partners" && typeof body.validation_pin === "string") row.validation_pin_hash = hashDriverPin(body.validation_pin);
    delete row.validation_pin;
    const { data, error } = await db.from(cfg.table).insert(row).select("*").single();
    if (error) return fail("CREATE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: `club.${entity}.create`, entityType: cfg.table, entityId: data.id as string, metadata: {}, request });
    const { validation_pin_hash, ...rest } = data as Record<string, unknown>;
    return ok({ ...rest, has_pin: Boolean(validation_pin_hash) });
  } catch (e) {
    return mapApiError(e);
  }
}

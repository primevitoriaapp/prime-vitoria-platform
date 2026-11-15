import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const STAFF = ["admin", "operador"];

/** Cadastros que chegaram pelas páginas do site (motoristas e empresas). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const kind = new URL(request.url).searchParams.get("kind");
    let q = db.from("site_leads").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(300);
    if (kind === "motorista" || kind === "empresa") q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) return fail("LEADS_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return mapApiError(e);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["novo", "em_contato", "aprovado", "descartado"]).optional(),
  notes: z.string().max(2000).optional()
});

export async function PATCH(request: Request) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const b = patchSchema.parse(await request.json());
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.status) upd.status = b.status;
    if (b.notes !== undefined) upd.notes = b.notes;
    const { error } = await db.from("site_leads").update(upd).eq("id", b.id).eq("tenant_id", tenantId);
    if (error) return fail("LEADS_FAILED", error.message, 500);
    return ok({ saved: true });
  } catch (e) {
    return mapApiError(e);
  }
}

import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { FINANCE_ENTITY_TYPES, FINANCE_FILE_KINDS } from "@/lib/finance/finance-files";

async function staff() {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "financeiro") return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

/** ?entity_type=company_payable&ids=a,b,c */
export async function GET(request: Request) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const u = new URL(request.url);
    const type = u.searchParams.get("entity_type") ?? "";
    const ids = (u.searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
    if (!(FINANCE_ENTITY_TYPES as readonly string[]).includes(type) || !ids.length) return ok([]);
    const { data } = await db
      .from("finance_files")
      .select("id, entity_id, kind, file_name, size_bytes, created_at")
      .eq("tenant_id", tenantId)
      .eq("entity_type", type)
      .in("entity_id", ids)
      .order("created_at");
    return ok(data ?? []);
  } catch (e) {
    return mapApiError(e);
  }
}

const schema = z.object({
  entity_type: z.enum(FINANCE_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  kind: z.enum(Object.keys(FINANCE_FILE_KINDS) as [string, ...string[]]),
  path: z.string().min(5).max(500),
  file_name: z.string().trim().min(1).max(200),
  size: z.number().int().nonnegative().optional(),
  content_type: z.string().max(120).optional().nullable()
});

export async function POST(request: Request) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("VALIDATION_ERROR", "Dados do anexo inválidos", 400);
    const b = parsed.data;
    if (!b.path.startsWith(`${tenantId}/financeiro/`)) return fail("FORBIDDEN", "Caminho inválido", 403);
    const table = b.entity_type === "company_payable" ? "company_payables" : "other_incomes";
    const { data: own } = await db.from(table).select("id").eq("id", b.entity_id).eq("tenant_id", tenantId).maybeSingle();
    if (!own) return fail("NOT_FOUND", "Lançamento não encontrado", 404);
    const { data, error } = await db
      .from("finance_files")
      .insert({
        tenant_id: tenantId,
        entity_type: b.entity_type,
        entity_id: b.entity_id,
        kind: b.kind,
        file_path: b.path,
        file_name: b.file_name,
        size_bytes: b.size ?? null,
        content_type: b.content_type ?? null,
        created_by: /^[0-9a-f-]{36}$/i.test(String(session.userId ?? "")) ? session.userId : null
      })
      .select("id")
      .single();
    if (error || !data) return fail("SAVE_FAILED", "Não foi possível salvar o anexo.", 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "finance.file_upload", entityType: b.entity_type, entityId: b.entity_id, metadata: { tipo: b.kind, arquivo: b.file_name } }).catch(() => undefined);
    return ok({ id: data.id });
  } catch (e) {
    return mapApiError(e);
  }
}

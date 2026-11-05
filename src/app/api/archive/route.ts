import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { ARCHIVE_CATEGORIES } from "@/lib/archive/archive-categories";

async function staff() {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "financeiro") return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

export async function GET() {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { data, error } = await db
      .from("archive_files")
      .select("id, category, title, period, file_name, size_bytes, content_type, notes, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return fail("LOAD_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return mapApiError(e);
  }
}

const schema = z.object({
  path: z.string().min(5).max(400),
  file_name: z.string().trim().min(1).max(200),
  size: z.number().int().nonnegative().optional(),
  content_type: z.string().max(120).optional().nullable(),
  category: z.enum(Object.keys(ARCHIVE_CATEGORIES) as [string, ...string[]]),
  title: z.string().trim().max(200).optional().nullable(),
  period: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable()
});

/** Registra o arquivo já enviado ao armazenamento. */
export async function POST(request: Request) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("VALIDATION_ERROR", "Dados do arquivo inválidos", 400);
    const b = parsed.data;
    if (!b.path.startsWith(`${tenantId}/`)) return fail("FORBIDDEN", "Caminho inválido", 403);
    const { data, error } = await db
      .from("archive_files")
      .insert({
        tenant_id: tenantId,
        category: b.category,
        title: b.title || b.file_name,
        period: b.period || null,
        file_path: b.path,
        file_name: b.file_name,
        size_bytes: b.size ?? null,
        content_type: b.content_type ?? null,
        notes: b.notes || null,
        created_by: /^[0-9a-f-]{36}$/i.test(String(session.userId ?? "")) ? session.userId : null
      })
      .select("id")
      .single();
    if (error || !data) return fail("SAVE_FAILED", "Não foi possível salvar o arquivo.", 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "archive.upload", entityType: "archive_file", entityId: data.id as string, metadata: { arquivo: b.file_name, pasta: b.category } }).catch(() => undefined);
    return ok({ id: data.id });
  } catch (e) {
    return mapApiError(e);
  }
}

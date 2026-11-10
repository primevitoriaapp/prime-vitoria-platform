import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { DRIVER_DOC_KIND_SET } from "@/lib/drivers/driver-document-kinds";

const STAFF = ["admin", "operador", "financeiro"];

/** Documentos atuais (o mais novo de cada tipo) com link temporário (10 min) para ver. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data, error } = await db
      .from("driver_documents")
      .select("id, kind, storage_path, file_name, mime, size_bytes, valid_until, created_at")
      .eq("tenant_id", tenantId)
      .eq("driver_id", id)
      .is("replaced_at", null)
      .order("created_at", { ascending: false });
    if (error) return fail("LIST_FAILED", error.message, 500);
    const rows = data ?? [];
    const signed = rows.length ? await db.storage.from("driver-docs").createSignedUrls(rows.map((r) => r.storage_path as string), 600) : { data: [] };
    const urlBy = new Map((signed.data ?? []).map((s) => [s.path as string, s.signedUrl as string]));
    return ok(rows.map((r) => ({ ...r, url: urlBy.get(r.storage_path as string) ?? null, storage_path: undefined })));
  } catch (e) {
    return mapApiError(e);
  }
}

const schema = z.object({
  kind: z.string(),
  path: z.string().min(5).max(400),
  file_name: z.string().max(200).optional().nullable(),
  mime: z.string().max(100).optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable()
});

/** Registra o arquivo que já subiu. O anterior do mesmo tipo fica guardado como histórico. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = schema.parse(await request.json());
    if (!DRIVER_DOC_KIND_SET.has(b.kind)) return fail("VALIDATION_ERROR", "Tipo de documento inválido", 400);
    if (!b.path.startsWith(`${tenantId}/${id}/`)) return fail("FORBIDDEN", "Arquivo fora da pasta do motorista", 403);
    await db.from("driver_documents").update({ replaced_at: new Date().toISOString() }).eq("driver_id", id).eq("kind", b.kind).is("replaced_at", null);
    const { data, error } = await db
      .from("driver_documents")
      .insert({ tenant_id: tenantId, driver_id: id, vehicle_id: b.vehicle_id ?? null, kind: b.kind, storage_path: b.path, file_name: b.file_name ?? null, mime: b.mime ?? null, size_bytes: b.size ?? null, valid_until: b.valid_until ?? null, uploaded_by: session.userId })
      .select("id")
      .single();
    if (error) return fail("SAVE_FAILED", error.message, 500);
    // Validade do seguro também vai para o veículo (avisos de vencimento).
    if (b.kind === "seguro" && b.valid_until && b.vehicle_id) {
      await db.from("vehicles").update({ insurance_expires_at: b.valid_until }).eq("id", b.vehicle_id).eq("tenant_id", tenantId);
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "driver.document_upload", entityType: "driver", entityId: id, metadata: { kind: b.kind }, request });
    return ok({ id: data.id });
  } catch (e) {
    return mapApiError(e);
  }
}

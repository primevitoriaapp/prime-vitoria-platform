import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";
import { updateDriverRow } from "@/lib/drivers/driver-db";
import { mapSupabaseError } from "@/lib/server/supabase-errors";
import { uploadDriverPhotoFile } from "@/lib/storage/driver-photo-upload";
import { insertAuditEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";

/** Upload foto do motorista (JPEG/PNG/WebP, máx. 5 MB). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: existing } = await db
      .from("drivers")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail("INVALID_FILE", "Seleccione uma imagem (JPEG, PNG ou WebP).", 400);
    }

    let uploaded: Awaited<ReturnType<typeof uploadDriverPhotoFile>>;
    try {
      uploaded = await uploadDriverPhotoFile({ tenantId, driverId: id, file });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha no upload";
      if (/Bucket not found|bucket/i.test(message)) {
        return fail(
          "STORAGE_NOT_CONFIGURED",
          "Armazenamento de fotos não configurado no Supabase.",
          503,
          "Aplicar migration 0045_driver_photo_url.sql no ambiente de staging."
        );
      }
      return fail("PHOTO_UPLOAD_FAILED", message, 400);
    }

    const { data, error, partialSave } = await updateDriverRow(id, tenantId, {
      photo_url: uploaded.storage_path
    });

    if (error || !data) {
      const mapped = mapSupabaseError(error!, "foto do motorista");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.photo_upload",
      entityType: "driver",
      entityId: id,
      metadata: { storage_path: uploaded.storage_path, partialSave: partialSave ?? false },
      request
    });

    return ok(
      {
        photo_url: uploaded.display_url ?? uploaded.storage_path,
        storage_path: uploaded.storage_path,
        ...(partialSave
          ? {
              _warning:
                "Foto enviada; confirme migration 0045 se a imagem não aparecer após recarregar a página."
            }
          : {})
      },
      201
    );
  } catch (error) {
    return mapApiError(error);
  }
}
